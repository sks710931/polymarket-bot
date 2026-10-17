import { DESK_MODE } from '@desk/shared-contracts';

export function App() {
  return (
    <main>
      <p className="mode">{DESK_MODE}</p>
      <h1>Polymarket Trading Desk</h1>
      <p>The workspace is ready for implementation.</p>
      <p>Market data and account connections are not configured.</p>
    </main>
  );
}
