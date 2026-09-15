export default function ReceiptNotFound() {
  return (
    <main className="receipt">
      <h1>No such receipt</h1>
      <p className="muted">
        Receipt ids are content addresses. A missing id means the decision was
        never sealed, or the address was mistyped — it never means the decision
        changed.
      </p>
    </main>
  );
}
