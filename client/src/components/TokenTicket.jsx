// The OPD token as a paper ticket: the one bold thing in the app, the same on
// Home, the slip and My token, so people always recognise "my token".
export default function TokenTicket({ token, top, title, children, className = '', size = 'lg' }) {
  return (
    <section className={`ticket @container px-5 pb-5 pt-4 ${className}`} aria-label={`${top || ''} ${token}`}>
      {top && <p className="text-sm font-semibold text-ink/70">{top}</p>}
      {/* Sized to the ticket's own width (cqi), so it fits in any column. */}
      <p className={`token-num whitespace-nowrap leading-none ${size === 'lg' ? 'my-2' : 'my-1'}`} style={{ fontSize: size === 'lg' ? 'min(3.25rem, 19cqi)' : 'min(2.25rem, 19cqi)' }}>
        {token}
      </p>
      {title && <div className="text-lg font-semibold leading-snug">{title}</div>}
      {children && <div className="ticket-cut mt-4 pt-4">{children}</div>}
    </section>
  )
}
