import { Card } from "../ui/card";

function parseAIResults(text: string): string {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return text;

  const header = lines[0].toLowerCase();
  if (!header.includes('class') || !header.includes('confidence')) {
    return text;
  }

  return lines.slice(1).map(line => {
    const [className, confidence] = line.split(',');
    return `${className}: ${confidence}`;
  }).join('\n');
}

export default function ProjectText({ text }: { text: string }) {
  const formattedText = parseAIResults(text);

  return (
    <Card className="size-full overflow-hidden p-4 select-none">
      <div className="size-full overflow-y-scroll overflow-x-hidden flex justify-start">
        <span className="text-sm font-medium text-start whitespace-pre-line">{formattedText}</span>
      </div>
    </Card>
  );
}
