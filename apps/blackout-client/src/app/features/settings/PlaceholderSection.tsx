export const PlaceholderSection = ({
    title,
    description,
    items,
}: {
    title: string;
    description: string;
    items: string[];
}) => (
    <section style={{ display: 'grid', gap: 12 }}>
        <header>
            <h3 style={{ marginBottom: 6 }}>{title}</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{description}</p>
        </header>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
            {items.map((item) => (
                <li key={item}>{item}</li>
            ))}
        </ul>
    </section>
);

export default PlaceholderSection;
