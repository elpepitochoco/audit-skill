import { useState } from 'react';

export function SignupDialog({ onClose, onSubmit }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  function submit(event) {
    event.preventDefault();
    if (!email.includes('@')) return setError('Invalid e-mail');
    onSubmit(email);
  }

  return (
    <div className="overlay">
      <div className="dialog">
        <div className="close" onClick={onClose}>×</div>
        <img src="/promo.png" />
        <h3>Join the beta</h3>
        <form onSubmit={submit}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" />
          {error && <span style={{ color: '#f88' }}>{error}</span>}
          <button type="submit" aria-hidden="true">Join</button>
        </form>
      </div>
    </div>
  );
}
