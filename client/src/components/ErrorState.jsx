export default function ErrorState({ message = 'Something went wrong', onRetry }) {
  return (
    <div className="card border-red-200 bg-red-50">
      <p className="font-semibold text-red-700">Error</p>
      <p className="mt-1 text-sm text-red-600">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-primary mt-3">
          Retry
        </button>
      )}
    </div>
  );
}
