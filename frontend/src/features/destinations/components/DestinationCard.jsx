import { Link } from 'react-router-dom';
import Icon from '../../../shared/components/Icon.jsx';
import FavoriteButton from './FavoriteButton.jsx';

export default function DestinationCard({ destination }) {
  const { slug, name, location, tag, rating, reviews, distanceKm, images } = destination;
  const hasReviews = Number(reviews) > 0;
  return (
    <article className="dest-card">
      <Link to={`/destinos/${slug}`} className="dest-card__link">
        <img className="dest-card__img" src={images[0]} alt="" loading="lazy" width="600" height="750" />
        <div className="dest-card__info">
          <div className="dest-card__row">
            <h3 className="dest-card__name">{name}</h3>
            {distanceKm != null && <span className="dest-card__distance">{distanceKm} km</span>}
          </div>
          <p className="dest-card__location">
            <Icon name="pin" size={16} filled className="pin" />
            <span>{location}</span>
          </p>
          {hasReviews && (
            <p className="dest-card__rating">
              <Icon name="star" size={16} filled className="star" />
              <strong>{Number(rating).toFixed(1)}</strong>
              <span className="muted">({reviews} reseñas)</span>
            </p>
          )}
        </div>
      </Link>
      <div className="dest-card__chips">
        <span className="glass-chip">{tag}</span>
      </div>
      <FavoriteButton destination={destination} className="dest-card__fav" />
    </article>
  );
}
