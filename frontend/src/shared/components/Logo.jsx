import { Link } from 'react-router-dom';

export default function Logo() {
  return (
    <Link to="/" className="logo" aria-label="TuDestino, ir al inicio">
      <img className="logo__mark" src="/icons/logo-mark.webp" width="36" height="36" alt="" />
      <span className="logo__text">TuDestino</span>
    </Link>
  );
}
