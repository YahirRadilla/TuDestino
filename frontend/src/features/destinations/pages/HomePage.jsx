import { useState } from 'react';
import { Link } from 'react-router-dom';
import SearchBar from '../../../shared/components/SearchBar.jsx';
import Logo from '../../../shared/components/Logo.jsx';
import NotificationsButton from '../../../shared/components/NotificationsButton.jsx';
import InstallButton from '../../../shared/components/InstallButton.jsx';
import CategoryChips from '../components/CategoryChips.jsx';
import DestinationResults from '../components/DestinationResults.jsx';
import { useDestinations } from '../hooks/useDestinations.js';

export default function HomePage() {
  const [category, setCategory] = useState(null);
  const result = useDestinations({ category });

  return (
    <div className="container page home">
      <div className="home__brand">
        <Logo />
      </div>
      <section className="home__hero" aria-label="Buscar destinos">
        <h1 className="home__title">
          Descubre Baja California Sur, <span>con cuidado</span>
        </h1>
        <p className="home__subtitle">
          Playas, áreas protegidas y cultura local, con guías para visitarlas sin dañarlas.
        </p>
        <div className="home__search-row">
          <SearchBar variant="hero" />
          <div className="home__bell">
            <NotificationsButton />
          </div>
        </div>
      </section>

      <section className="banner" aria-label="Turismo responsable">
        <div className="banner__text">
          <strong>Viaja con cuidado</strong>
          <span>Conoce las reglas de cada sitio y reporta lo que veas: tu aviso protege la vida marina.</span>
        </div>
        <Link to="/explorar" className="btn btn--primary banner__cta">
          Empezar
        </Link>
      </section>

      <InstallButton variant="card" />

      <CategoryChips selected={category} onSelect={setCategory} />

      <section aria-labelledby="home-destinos" className="home__list">
        <div className="home__list-head">
          <h2 id="home-destinos" className="section-title">
            Destinos para ti
          </h2>
          <Link to="/explorar" className="home__see-all">
            Ver todo
          </Link>
        </div>
        <DestinationResults
          result={result}
          emptyTitle="Aún no hay destinos en esta categoría"
          emptyText="Estamos sumando más sitios. Prueba con otra categoría."
        />
      </section>
    </div>
  );
}
