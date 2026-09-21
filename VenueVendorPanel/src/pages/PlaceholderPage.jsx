export function PlaceholderPage({ title, description }) {
  return (
    <div className="page-card">
      <div className="page-card__head">
        <h2 className="page-card__title">{title}</h2>
        <p className="page-card__desc">{description}</p>
      </div>
      <div className="section-placeholder">Screen coming next — will match your Figma service vendor flows.</div>
    </div>
  );
}
