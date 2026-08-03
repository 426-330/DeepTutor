import SpecEditor from "@/components/video/SpecEditor";

// KaTeX global CSS for the formula scenes in the preview Player (the vendored
// FormulaBlock's own css import is stripped by the sync script — global CSS
// may only be imported from the app/ directory).
import "katex/dist/katex.min.css";

export default async function VideoSpecEditPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return <SpecEditor name={decodeURIComponent(name)} />;
}
