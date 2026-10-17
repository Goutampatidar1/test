export function ListHeader({ title, subtitle, actions }) {
  return (
    <div className="page-card__head list-head">
      <div>
        <h2 className="page-card__title">{title}</h2>
        {subtitle ? <p className="list-head__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="list-head__actions">{actions}</div> : null}
    </div>
  );
}
