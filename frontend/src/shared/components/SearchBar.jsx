import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon from './Icon.jsx';

export default function SearchBar({ variant = 'default', placeholder = '¿A dónde quieres ir?' }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const onSubmit = (event) => {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get('q')?.toString().trim();
    navigate(q ? `/explorar?q=${encodeURIComponent(q)}` : '/explorar');
  };

  return (
    <form className={`search search--${variant}`} role="search" onSubmit={onSubmit}>
      <Icon name="search" size={20} className="search__icon" />
      <input
        className="search__input"
        type="search"
        name="q"
        defaultValue={params.get('q') ?? ''}
        placeholder={placeholder}
        aria-label="Buscar destinos"
        autoComplete="off"
      />
      <button className="btn btn--primary search__submit" type="submit">
        Buscar
      </button>
    </form>
  );
}
