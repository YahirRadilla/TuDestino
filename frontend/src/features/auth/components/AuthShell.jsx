import PageHeader from '../../../shared/components/PageHeader.jsx';

// Common frame for the credential screens: header, intro copy and a centered card.
export default function AuthShell({ title, intro, children, footer }) {
  return (
    <div className="container page auth">
      <PageHeader title={title} />
      <section className="auth__card">
        {intro && <p className="auth__intro muted">{intro}</p>}
        {children}
      </section>
      {footer && <div className="auth__footer">{footer}</div>}
    </div>
  );
}
