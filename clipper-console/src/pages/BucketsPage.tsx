import { BucketBrowser } from "@/components/bucket/BucketBrowser";

export function BucketsPage() {
  return (
    <div className="container max-w-5xl mx-auto py-8 px-4">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Buckets</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload files, view, and manage bucket contents.
        </p>
      </header>
      <BucketBrowser />
    </div>
  );
}
