"""Built-in capability class paths."""

BUILTIN_CAPABILITY_CLASSES: dict[str, str] = {
    "chat": "deeptutor.agents.chat.capability:ChatCapability",
    "deep_solve": "deeptutor.capabilities.solve.capability:DeepSolveCapability",
    "deep_question": "deeptutor.agents.question.capability:DeepQuestionCapability",
    "deep_research": "deeptutor.agents.research.capability:DeepResearchCapability",
    "math_animator": "deeptutor.agents.math_animator.capability:MathAnimatorCapability",
    "visualize": "deeptutor.agents.visualize.capability:VisualizeCapability",
    # video-generation-system（M1 最小闭环）
    "video_spec": "deeptutor.capabilities.video.capability:VideoSpecCapability",
    "narration_gen": "deeptutor.capabilities.video.narration_capability:NarrationGenCapability",
    # video-generation-system（M2 完整流水线 backend 线，tasks.md 5.1/5.3）
    "asset_gen": "deeptutor.capabilities.video.asset_capability:AssetGenCapability",
    "video_compose": "deeptutor.capabilities.video.compose_capability:VideoComposeCapability",
    "video_pipeline": "deeptutor.capabilities.video.pipeline_capability:VideoPipelineCapability",
    # video-generation-system: 裁剪学习域（开关优先，可恢复）
    # mastery_path（Guided Learning）不属于视频生成系统目标域，注册摘除；
    # 恢复时取消下行注释即可。
    # "mastery_path": "deeptutor.capabilities.mastery.capability:MasteryPathCapability",
}
