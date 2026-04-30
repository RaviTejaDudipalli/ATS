export default function EmptyState({ title, description, action, icon: Icon }) {
  return (
    <div className="card grid place-items-center p-10 text-center">
      {Icon && (
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-purple-500 text-white">
          <Icon size={20} />
        </span>
      )}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="muted mt-1 max-w-md text-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
