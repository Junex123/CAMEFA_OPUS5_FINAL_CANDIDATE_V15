import { DecideConsole } from '@/components/decide-console';

export const metadata = { title: 'Decide · Camefa' };

export default function DecidePage() {
  return (
    <main className="decide">
      <h1>Decide</h1>
      <DecideConsole />
    </main>
  );
}
