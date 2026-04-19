import { MorphClient } from '../generated/morph';

const morph = new MorphClient();

export default async function Page() {
  const [users, selectedUser] = await Promise.all([
    morph.users.list(),
    morph.users.getById({
      params: {
        id: 1,
      },
    }),
  ]);
  const featuredUsers = users.slice(0, 6);

  return (
    <main className="shell">
      <section className="summary">
        <div>
          <p className="eyebrow">Morph + Next.js</p>
          <h1>JSONPlaceholder users</h1>
        </div>
        <div className="metric">
          <span>{users.length}</span>
          <strong>users loaded</strong>
        </div>
      </section>

      <section className="grid">
        <article className="panel usersPanel">
          <div className="panelHeader">
            <h2>Directory</h2>
            <span>GET /users</span>
          </div>
          <div className="userList">
            {featuredUsers.map((user) => (
              <div className="userRow" key={user.id}>
                <div className="avatar">{getInitials(user.name)}</div>
                <div>
                  <strong>{user.name}</strong>
                  <span>@{user.username}</span>
                </div>
                <a href={`mailto:${user.email}`}>{user.email}</a>
              </div>
            ))}
          </div>
        </article>

        <aside className="sideStack">
          <article className="panel">
            <div className="panelHeader">
              <h2>Selected</h2>
              <span>GET /users/:id</span>
            </div>
            <UserSpotlight
              city={selectedUser.address.city}
              company={selectedUser.company.name}
              email={selectedUser.email}
              name={selectedUser.name}
              website={selectedUser.website}
            />
          </article>

          <article className="panel">
            <div className="panelHeader">
              <h2>Company</h2>
              <span>Nested response</span>
            </div>
            <div className="companyCard">
              <strong>{selectedUser.company.catchPhrase}</strong>
              <span>{selectedUser.company.bs}</span>
            </div>
          </article>
        </aside>
      </section>
    </main>
  );
}

function UserSpotlight({
  city,
  company,
  email,
  name,
  website,
}: {
  city: string;
  company: string;
  email: string;
  name: string;
  website: string;
}) {
  return (
    <div className="spotlight">
      <div className="avatar large">{getInitials(name)}</div>
      <div>
        <strong>{name}</strong>
        <span>{email}</span>
      </div>
      <div className="detailList">
        <span>{company}</span>
        <span>{city}</span>
        <span>{website}</span>
      </div>
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
