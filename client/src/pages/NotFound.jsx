import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="card text-center">
      <h2 className="text-xl font-bold">404 – Page not found</h2>
      <Link to="/" className="btn-primary mt-4">Go home</Link>
    </div>
  );
}
