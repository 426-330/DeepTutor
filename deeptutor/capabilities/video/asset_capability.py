"""asset_gen capability：spec YAML → 插画/截图素材 + 图表数据 + BGM 解析。

流程（M2，specs/asset-gen）：

1. loading —— 读取 spec（overrides ``spec``/``spec_path``，缺省取最新），
   校验后解析生效色板（style.theme + 色卡规范 + style.colors 覆盖，D3）；
2. illustrating —— 每屏 ``visual.primary`` 生成插画：prompt 注入色板描述
   （色卡规范 §3），产物 ``assets/s<NN>.<ext>`` + 旁车 ``.meta.json``
   （prompt/模型/尺寸等，可追溯）；visual 含 URL 的屏跳过插画改走截图；
3. capturing —— 含 URL 的屏经 exec 沙箱 Playwright/Chromium 截图
   （``assets/s<NN>_web.png`` + meta），失败降级记 degraded 不阻断；
4. collecting —— 图表数据落 ``data/``（overrides ``chart_data`` 给本地
   路径或 URL；worker chartData.ts 按 ``<video_dir>/data/<ref>`` 解析），
   缺失引用记 degraded；BGM 从素材库解析（约定见 assets.py docstring）；
   写 ``assets/manifest.json`` 总账。

素材引用不进 YAML（scene schema 封闭），走约定命名 + manifest 契约。
"""

from __future__ import annotations

import logging
from pathlib import Path
import shutil
from typing import Any

import yaml

from deeptutor.agents._shared.capability_result import emit_capability_result
from deeptutor.capabilities.video.assets import (
    SCREENSHOT_TIMEOUT_S,
    build_illustration_prompt,
    build_screenshot_command,
    chart_data_refs,
    find_urls,
    resolve_bgm,
    write_manifest,
    write_meta,
)
from deeptutor.capabilities.video.migrations import migrate_spec
from deeptutor.capabilities.video.paths import (
    latest_spec_path,
    resolve_spec_path,
    video_dir_for_spec,
    videos_root,
)
from deeptutor.capabilities.video.themes import palette_description, resolve_palette
from deeptutor.capabilities.video.validator import format_errors_for_llm, validate_schema
from deeptutor.core.agentic.usage import UsageTracker
from deeptutor.core.capability_protocol import BaseCapability, CapabilityManifest
from deeptutor.core.context import UnifiedContext
from deeptutor.core.stream_bus import StreamBus
from deeptutor.i18n import StatusI18n

logger = logging.getLogger(__name__)

_EXT_BY_CONTENT_TYPE = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}


class AssetGenCapability(BaseCapability):
    manifest = CapabilityManifest(
        name="asset_gen",
        description=(
            "Generate per-scene illustration assets (imagegen with theme "
            "palette injected), web screenshots via sandboxed Playwright, "
            "chart data files and BGM resolution for a video spec."
        ),
        stages=["loading", "illustrating", "capturing", "collecting"],
        tools_used=["imagegen", "exec"],
        cli_aliases=["asset_gen", "assets"],
    )

    async def run(self, context: UnifiedContext, stream: StreamBus) -> None:
        from deeptutor.services.llm.config import get_llm_config

        llm_config = get_llm_config()
        usage = UsageTracker(model=getattr(llm_config, "model", None))
        i18n = StatusI18n(self.name, context.language, module="capabilities")
        overrides = context.config_overrides or {}

        # ── Stage 1: 加载 spec + 解析色板 ────────────────────────────────
        async with stream.stage("loading", source=self.name):
            resolved = await self._load_spec(overrides, stream, i18n, usage)
            if resolved is None:
                return
            spec_path, data, scenes = resolved
            video_dir = video_dir_for_spec(spec_path)
            assets_dir = video_dir / "assets"
            data_dir = video_dir / "data"
            assets_dir.mkdir(parents=True, exist_ok=True)
            data_dir.mkdir(parents=True, exist_ok=True)
            try:
                theme, palette = resolve_palette(data.get("style"))
                palette_desc = palette_description(palette)
            except FileNotFoundError as exc:
                await stream.error(str(exc), source=self.name, stage="loading")
                return
            await stream.progress(
                message=i18n.t(
                    "loaded",
                    f"Spec loaded: {spec_path} ({len(scenes)} scenes), theme {theme}.",
                    path=str(spec_path),
                    count=len(scenes),
                    theme=theme,
                ),
                source=self.name,
                stage="loading",
            )

        force = bool(overrides.get("force", False))
        assets: list[dict[str, Any]] = []
        degraded: list[str] = []

        # ── Stage 2: 插画生成（imagegen + 色板注入） ─────────────────────
        async with stream.stage("illustrating", source=self.name):
            imagegen_meta = self._imagegen_config_meta()
            for idx, scene in enumerate(scenes, start=1):
                visual = str((scene.get("visual") or {}).get("primary") or "").strip()
                if not visual or find_urls(visual):
                    continue  # 无视觉描述跳过；含 URL 的屏走截图阶段
                existing = self._existing_illustration(assets_dir, idx)
                if existing and not force:
                    assets.append(existing)
                    continue
                prompt = build_illustration_prompt(
                    visual, palette_desc=palette_desc, scene_title=str(scene.get("title") or "")
                )
                try:
                    asset = await self._generate_illustration(
                        assets_dir,
                        scene=idx,
                        prompt=prompt,
                        imagegen_meta=imagegen_meta,
                        overrides=overrides,
                    )
                except Exception as exc:  # provider 错误单屏降级，不阻断整批
                    logger.warning("illustration failed for scene %d: %s", idx, exc)
                    degraded.append(f"s{idx:02d}: illustration failed: {exc}")
                    await stream.progress(
                        message=i18n.t(
                            "illustration_failed",
                            f"Scene {idx}: illustration failed (degraded).",
                            scene=idx,
                        ),
                        source=self.name,
                        stage="illustrating",
                    )
                    continue
                assets.append(asset)
                await stream.progress(
                    message=i18n.t(
                        "illustration_done",
                        f"Scene {idx}/{len(scenes)} illustration done.",
                        scene=idx,
                        total=len(scenes),
                    ),
                    current=idx,
                    total=len(scenes),
                    source=self.name,
                    stage="illustrating",
                )

        # ── Stage 3: 网页截图（沙箱 Playwright，可降级） ─────────────────
        async with stream.stage("capturing", source=self.name):
            for idx, scene in enumerate(scenes, start=1):
                visual = str((scene.get("visual") or {}).get("primary") or "").strip()
                urls = find_urls(visual)
                if not urls:
                    continue
                outcome = await self._capture_screenshot(assets_dir, scene=idx, url=urls[0])
                if outcome is not None:
                    assets.append(outcome)
                else:
                    degraded.append(f"s{idx:02d}: screenshot degraded")

        # ── Stage 4: 图表数据 + BGM + manifest ──────────────────────────
        async with stream.stage("collecting", source=self.name):
            chart_files = await self._ingest_chart_data(data_dir, overrides)
            for scene_idx, ref in chart_data_refs(scenes):
                if not (data_dir / ref).is_file():
                    degraded.append(f"s{scene_idx:02d}: chart-data-missing: {ref}")

            bgm_path = resolve_bgm(videos_root(), str(overrides.get("bgm") or "auto"))
            bgm_entry = {"path": str(bgm_path)} if bgm_path else None
            if overrides.get("bgm") and bgm_path is None:
                degraded.append(f"bgm: not found: {overrides.get('bgm')}")

            manifest = {
                "spec": str(spec_path),
                "video_dir": str(video_dir),
                "palette": {"theme": theme, "colors": palette},
                "assets": assets,
                "chart_data": chart_files,
                "bgm": bgm_entry,
                "degraded": degraded,
            }
            manifest_path = write_manifest(assets_dir / "manifest.json", manifest)

        response_md = i18n.t(
            "done",
            (
                f"素材生成完成：{len(assets)} 个素材，manifest：`{manifest_path}`"
            ),
            count=len(assets),
            manifest_path=str(manifest_path),
        )
        if degraded:
            response_md += "\n" + i18n.t(
                "done_degraded_note",
                f"（{len(degraded)} 项降级，详见 manifest.degraded。）",
                count=len(degraded),
            )
        await stream.content(response_md, source=self.name, stage="collecting")
        await emit_capability_result(
            stream,
            {
                "response": response_md,
                "ok": True,
                "spec_path": str(spec_path),
                "video_dir": str(video_dir),
                "assets_dir": str(assets_dir),
                "manifest_path": str(manifest_path),
                "assets": assets,
                "chart_data": chart_files,
                "bgm": bgm_entry,
                "palette": {"theme": theme, "colors": palette},
                "degraded": degraded,
            },
            source=self.name,
            usage=usage,
        )

    # ------------------------------------------------------------------

    async def _load_spec(self, overrides, stream, i18n, usage):
        try:
            reference = str(overrides.get("spec") or overrides.get("spec_path") or "")
            spec_path = resolve_spec_path(reference) if reference else latest_spec_path()
        except FileNotFoundError as exc:
            await stream.error(str(exc), source=self.name, stage="loading")
            await emit_capability_result(
                stream, {"response": str(exc), "ok": False}, source=self.name, usage=usage
            )
            return None
        data = yaml.safe_load(spec_path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            await stream.error(
                i18n.t("spec_invalid", "Spec is not a YAML mapping."),
                source=self.name,
                stage="loading",
            )
            return None
        try:
            data = migrate_spec(data).data
        except ValueError as exc:
            await stream.error(str(exc), source=self.name, stage="loading")
            return None
        schema_errors = validate_schema(data)
        if schema_errors:
            rendered = format_errors_for_llm(schema_errors)
            await stream.error(rendered, source=self.name, stage="loading")
            await emit_capability_result(
                stream,
                {
                    "response": rendered,
                    "ok": False,
                    "spec_path": str(spec_path),
                    "validation_errors": [e.render() for e in schema_errors],
                },
                source=self.name,
                usage=usage,
            )
            return None
        scenes = [s for s in (data.get("scenes") or []) if isinstance(s, dict)]
        return spec_path, data, scenes

    @staticmethod
    def _imagegen_config_meta() -> dict[str, Any]:
        """旁车 meta 用的 provider 信息（best effort，不阻断生成）。"""
        try:
            from deeptutor.services.config.provider_runtime import (
                resolve_imagegen_runtime_config,
            )

            config = resolve_imagegen_runtime_config()
            return {
                "model": config.model,
                "provider": config.provider_name,
                "size": config.size,
                "quality": config.quality,
                "style": config.style,
            }
        except Exception:
            return {}

    @staticmethod
    def _existing_illustration(assets_dir: Path, scene: int) -> dict[str, Any] | None:
        for ext in (".png", ".jpg", ".webp"):
            candidate = assets_dir / f"s{scene:02d}{ext}"
            meta = assets_dir / f"s{scene:02d}.meta.json"
            if candidate.is_file() and meta.is_file():
                return {
                    "scene": scene,
                    "kind": "illustration",
                    "file": str(candidate),
                    "meta": str(meta),
                    "reused": True,
                }
        return None

    async def _generate_illustration(
        self,
        assets_dir: Path,
        *,
        scene: int,
        prompt: str,
        imagegen_meta: dict[str, Any],
        overrides: dict[str, Any],
    ) -> dict[str, Any]:
        from deeptutor.services.imagegen import generate_image

        size = str(overrides.get("image_size") or "").strip() or None
        images = await generate_image(prompt, size=size)
        if not images:
            raise RuntimeError("imagegen returned no image")
        image_bytes, content_type = images[0]
        ext = _EXT_BY_CONTENT_TYPE.get((content_type or "").split(";")[0].strip(), ".png")
        asset_path = assets_dir / f"s{scene:02d}{ext}"
        asset_path.write_bytes(image_bytes)
        meta_path = write_meta(
            assets_dir / f"s{scene:02d}.meta.json",
            kind="illustration",
            scene=scene,
            params={
                "prompt": prompt,
                "seed": None,  # provider 层暂无 seed 入口，见 assets.write_meta
                **imagegen_meta,
                **({"size": size} if size else {}),
                "content_type": content_type,
            },
        )
        return {
            "scene": scene,
            "kind": "illustration",
            "file": str(asset_path),
            "meta": str(meta_path),
        }

    async def _capture_screenshot(
        self, assets_dir: Path, *, scene: int, url: str
    ) -> dict[str, Any] | None:
        try:
            from deeptutor.services.sandbox import (
                ExecRequest,
                Mount,
                ResourceLimits,
                get_sandbox_service,
            )
        except ImportError:
            return None
        service = get_sandbox_service()
        if not await service.available():
            logger.warning("screenshot degraded for scene %d: sandbox unavailable", scene)
            return None
        out_name = f"s{scene:02d}_web.png"
        result = await service.run(
            ExecRequest(
                command=build_screenshot_command(url, out_name),
                workdir=str(assets_dir),
                mounts=(
                    Mount(host_path=str(assets_dir), sandbox_path=str(assets_dir), read_only=False),
                ),
                limits=ResourceLimits(timeout_s=SCREENSHOT_TIMEOUT_S),
            ),
            user_id="asset_gen",
        )
        out_path = assets_dir / out_name
        if not result.ok or result.exit_code != 0 or not out_path.is_file():
            logger.warning(
                "screenshot failed for scene %d: %s",
                scene,
                (result.error or result.stderr or f"exit {result.exit_code}")[:300],
            )
            return None
        meta_path = write_meta(
            assets_dir / f"s{scene:02d}_web.meta.json",
            kind="screenshot",
            scene=scene,
            params={"url": url, "viewport": "1280x720", "engine": "playwright"},
        )
        return {
            "scene": scene,
            "kind": "screenshot",
            "file": str(out_path),
            "meta": str(meta_path),
        }

    async def _ingest_chart_data(
        self, data_dir: Path, overrides: dict[str, Any]
    ) -> list[str]:
        """overrides ``chart_data``: 本地路径或 URL 列表，落 data/ 保留文件名。"""
        files: list[str] = []
        for item in overrides.get("chart_data") or []:
            ref = str(item or "").strip()
            if not ref:
                continue
            try:
                if ref.startswith(("http://", "https://")):
                    import httpx

                    async with httpx.AsyncClient(timeout=30.0) as client:
                        resp = await client.get(ref)
                        resp.raise_for_status()
                    name = ref.rstrip("/").rsplit("/", 1)[-1] or "data.csv"
                    target = data_dir / name
                    target.write_bytes(resp.content)
                else:
                    source = Path(ref)
                    if not source.is_file():
                        continue
                    target = data_dir / source.name
                    shutil.copy2(source, target)
                files.append(str(target))
            except Exception as exc:
                logger.warning("chart data ingest failed for %s: %s", ref, exc)
        return files


__all__ = ["AssetGenCapability"]
