export default function Empty({ title = 'Nothing here yet', hint = 'New study plans, quizzes and uploads will appear here.' }) {
  return (
    <div className="card text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{hint}</p>
    </div>
  );
}
