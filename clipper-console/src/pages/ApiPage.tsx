import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CLIPPER_API_BASE } from "@/lib/clipper-api";

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="rounded-lg border bg-muted/30 p-3 text-xs overflow-x-auto">
      <code>{code}</code>
    </pre>
  );
}

export function ApiPage() {
  const base = CLIPPER_API_BASE;

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">API</h1>
        <p className="text-sm text-muted-foreground">
          Quick API reference for edits, workflows, and buckets.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Base URL</CardTitle>
          <CardDescription>
            Current frontend target
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock code={base} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Edits</CardTitle>
          <CardDescription>Create and monitor video edit jobs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CodeBlock
            code={`curl -X POST '${base}/edits' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "media": "https://your-bucket/file.mp4",
    "operations": [
      { "op": "trim", "start_sec": 0, "end_sec": 10 },
      { "op": "text", "segment": [{ "start_sec": 1, "end_sec": 4, "text": "Hello" }] }
    ]
  }'`}
          />
          <CodeBlock
            code={`curl '${base}/edits?limit=20&last_id=0'
curl '${base}/edits/123'
curl -X POST '${base}/edits/123/retry'
curl -X POST '${base}/edits/123/cancel'

# SSE status stream
curl -N '${base}/edits/status?uid=<edit_uid>'`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workflows</CardTitle>
          <CardDescription>Create reusable pipelines and execute them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CodeBlock
            code={`curl -X POST '${base}/workflows' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "name": "Shorts pipeline",
    "search": "social",
    "steps": [
      [{ "op": "trim", "start_sec": 0, "end_sec": 20 }],
      [{ "op": "compress", "preset": "medium" }]
    ]
  }'`}
          />
          <CodeBlock
            code={`curl '${base}/workflows?limit=50&last_id=0'
curl '${base}/workflows/12'
curl -X PATCH '${base}/workflows/12' -H 'Content-Type: application/json' -d '{"name":"Updated"}'
curl -X DELETE '${base}/workflows/12'

# Execute by workflow id
curl -X POST '${base}/workflows/execute?media=https%3A%2F%2Fyour-bucket%2Fclip.mp4&id=12'

# Execution history and jobs
curl '${base}/workflows/12/executions?limit=20'
curl '${base}/workflows/executions?limit=20'
curl '${base}/workflows/executions/55/jobs'

# Retry execution by uid
curl -X POST '${base}/workflows/12/retry' \\
  -H 'Content-Type: application/json' \\
  -d '{"uid":"execution_uid_here"}'`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buckets</CardTitle>
          <CardDescription>Upload, list, and delete files.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <CodeBlock
            code={`curl -X POST '${base}/bucket/upload' \\
  -F 'file=@/absolute/path/to/video.mp4'`}
          />
          <CodeBlock
            code={`curl '${base}/bucket/?page=1&limit=50'
curl -X DELETE '${base}/bucket/files/123'`}
          />
        </CardContent>
      </Card>
    </div>
  );
}

