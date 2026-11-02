import Icon from '../../../shared/components/Icon.jsx';

// Read-only star rating with a text alternative.
export default function Stars({ value }) {
  const rounded = Math.round(value);
  return (
    <span className="stars" role="img" aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name="star"
          size={14}
          filled={n <= rounded}
          className={n <= rounded ? 'star' : 'star star--off'}
        />
      ))}
    </span>
  );
}
