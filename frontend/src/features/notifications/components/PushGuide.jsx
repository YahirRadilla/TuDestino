import Icon from '../../../shared/components/Icon.jsx';

// Plain-language explanation for each state in which push cannot simply be switched on.
const GUIDES = {
  'ios-install': {
    icon: 'download',
    title: 'Instala la app para recibir avisos',
    text: 'En iPhone y iPad los avisos solo funcionan con la app instalada. Toca «Compartir» (el cuadro con una flecha) y elige «Agregar a pantalla de inicio». Después ábrela desde su ícono y activa los avisos.',
  },
  denied: {
    icon: 'bell',
    title: 'Los avisos están bloqueados',
    text: 'Bloqueaste las notificaciones de TuDestino. Para volver a activarlas, abre la configuración del sitio en tu navegador (el candado junto a la dirección), cambia «Notificaciones» a «Permitir» y recarga la página.',
  },
  unsupported: {
    icon: 'bell',
    title: 'Tu navegador no admite avisos',
    text: 'Prueba con una versión reciente de Chrome, Edge o Firefox. Mientras tanto puedes consultar tus reportes en «Seguimiento».',
  },
};

export default function PushGuide({ kind }) {
  const guide = GUIDES[kind];
  if (!guide) return null;
  return (
    <section className={`push-guide push-guide--${kind}`} aria-label={guide.title}>
      <Icon name={guide.icon} size={22} />
      <div>
        <h3 className="push-guide__title">{guide.title}</h3>
        <p className="muted push-guide__text">{guide.text}</p>
      </div>
    </section>
  );
}
