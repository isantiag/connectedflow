export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
      <h2 className="text-xl font-semibold">Page not found</h2>
      <a href="/" className="text-sm text-primary underline">Go to Dashboard</a>
    </div>
  );
}
