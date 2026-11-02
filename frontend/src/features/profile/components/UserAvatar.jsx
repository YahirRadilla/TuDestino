import { useState } from 'react';
import Icon from '../../../shared/components/Icon.jsx';

// Shows the profile photo when it loads, otherwise the person's initial (or a generic icon).
export default function UserAvatar({ user, size = 64, className = '' }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  const initial = user?.full_name?.trim().charAt(0).toUpperCase();

  if (user?.avatar_url && !failed) {
    return (
      <img
        src={user.avatar_url}
        alt=""
        className={`avatar ${className}`}
        style={style}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className={`avatar avatar--fallback ${className}`} style={style} aria-hidden="true">
      {initial || <Icon name="user" size={Math.round(size / 2)} />}
    </span>
  );
}
