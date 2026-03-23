interface DeepDivePanelProps {
  cardIndex: number;
  bookmarked: number;
}

const ROOM_CARDS = [
  { title: "mutual-aid-hub", members: 432, preview: "Request and offer support resources.", activity: "High" },
  { title: "co-op-dev", members: 188, preview: "Collaborative product planning and code review.", activity: "Medium" },
  { title: "mesh-ops", members: 96, preview: "Federation health drills and incident runbooks.", activity: "High" },
];

export function renderDeepDivePanel({ cardIndex, bookmarked }: DeepDivePanelProps): string {
  const card = ROOM_CARDS[cardIndex % ROOM_CARDS.length];

  return `
    <section class="deepdive-panel" data-testid="deepdive-panel">
      <header>
        <h2>DeepDive Discovery</h2>
        <p class="meta">Swipe-style room discovery for mobile-first onboarding.</p>
      </header>
      <article class="deepdive-card" data-testid="deepdive-card">
        <h3># ${card.title}</h3>
        <p>${card.preview}</p>
        <p class="meta">Members: ${card.members} · Activity: ${card.activity}</p>
      </article>
      <div class="deepdive-actions">
        <button type="button" data-action="deepdive-dismiss">Swipe left</button>
        <button type="button" data-action="deepdive-join">Swipe right</button>
        <button type="button" data-action="deepdive-bookmark">Swipe up</button>
      </div>
      <p class="meta">Bookmarked rooms: <strong data-testid="deepdive-bookmarked">${bookmarked}</strong></p>
    </section>
  `;
}
