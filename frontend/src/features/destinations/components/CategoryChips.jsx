import { Link } from 'react-router-dom';
import Icon from '../../../shared/components/Icon.jsx';
import { CATEGORIES } from '../data/seed.js';

export default function CategoryChips({ selected, onSelect }) {
  return (
    <div className="chips" role="group" aria-label="Categorías">
      <button type="button" className="chip" aria-pressed={!selected} onClick={() => onSelect(null)}>
        <Icon name="compass" size={18} />
        Todos
      </button>
      {CATEGORIES.map((category) => (
        <button
          key={category.id}
          type="button"
          className="chip"
          aria-pressed={selected === category.id}
          onClick={() => onSelect(selected === category.id ? null : category.id)}
        >
          <Icon name={category.icon} size={18} />
          {category.label}
        </button>
      ))}
      <Link to="/eventos" className="chip">
        <Icon name="calendar" size={18} />
        Eventos
      </Link>
    </div>
  );
}
