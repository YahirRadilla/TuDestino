import { useId } from 'react';
import LocationPicker from '../../map/components/LocationPicker.jsx';
import Icon from '../../../shared/components/Icon.jsx';
import FormField from '../../auth/components/FormField.jsx';
import { useDestinations } from '../../destinations/hooks/useDestinations.js';
import { LOCATION_MESSAGES, useReportLocation } from '../useReportLocation.js';

// Where it happened: GPS on request (PWA-14), or by hand, or by picking a destination.
export default function LocationStep({ values, errors, onChange }) {
  const id = useId();
  const { status, accuracy, request } = useReportLocation({
    onFix: ({ lat, lng, accuracy_m }) => onChange({ lat: String(lat), lng: String(lng), accuracy_m }),
  });
  const destinations = useDestinations();
  const options = destinations.status === 'ready' ? destinations.data : [];
  const hasPosition = values.lat !== '' && values.lng !== '';
  const message = LOCATION_MESSAGES[status];
  const problem = status !== 'idle' && status !== 'ready' && status !== 'locating';

  const pickDestination = (event) => {
    const slug = event.target.value;
    const destination = options.find((item) => item.slug === slug);
    if (!destination) {
      onChange({ destination_slug: '' });
      return;
    }
    onChange({
      destination_slug: slug,
      lat: String(destination.coords.lat),
      lng: String(destination.coords.lng),
      accuracy_m: null,
    });
  };

  return (
    <section className="location" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="report-step__subtitle">
        ¿Dónde ocurrió?
      </h3>
      <button
        type="button"
        className="btn btn--primary location__gps"
        onClick={request}
        disabled={status === 'locating'}
      >
        <Icon name="navigation" size={18} />
        {status === 'locating' ? 'Buscando…' : 'Usar mi ubicación'}
      </button>

      <p
        className={problem ? 'location__status location__status--problem' : 'location__status'}
        role={problem ? 'alert' : 'status'}
      >
        {status === 'ready' && accuracy > 0
          ? `Ubicación lista · precisión de unos ${accuracy} m.`
          : status === 'ready'
            ? 'Ubicación lista.'
            : message ||
              (hasPosition
                ? 'Ubicación establecida. Puedes ajustarla abajo.'
                : 'Toca el botón o indica el lugar de otra forma.')}
      </p>

      <LocationPicker
        value={values}
        onChange={({ lat, lng }) => onChange({ lat: String(lat), lng: String(lng), accuracy_m: null })}
        label="Mapa para marcar dónde ocurrió"
      />

      <div className="field">
        <label htmlFor={`${id}-destination`} className="field__label">
          O elige un destino cercano <span className="muted">(opcional)</span>
        </label>
        <select
          id={`${id}-destination`}
          className="field__input field__select"
          value={values.destination_slug}
          onChange={pickDestination}
        >
          <option value="">Ninguno</option>
          {options.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <details className="location__manual" open={Boolean(errors.lat || errors.lng) || problem}>
        <summary>Ajustar coordenadas a mano</summary>
        <div className="location__fields">
          <FormField
            id={`${id}-lat`}
            label="Latitud"
            inputMode="decimal"
            autoComplete="off"
            placeholder="24.14260"
            value={values.lat}
            error={errors.lat}
            onChange={(event) => onChange({ lat: event.target.value, accuracy_m: null })}
          />
          <FormField
            id={`${id}-lng`}
            label="Longitud"
            inputMode="decimal"
            autoComplete="off"
            placeholder="-110.31280"
            value={values.lng}
            error={errors.lng}
            onChange={(event) => onChange({ lng: event.target.value, accuracy_m: null })}
          />
        </div>
      </details>
    </section>
  );
}
