import { Link } from 'react-router-dom';
import { buttonClass } from '../components/ui';

export default function NotFound() {
  return (
    <div className="border border-line border-t-4 border-t-brand bg-paper px-6 py-14 text-center">
      <p className="text-[13px] font-black uppercase tracking-[0.1em] text-brand">Page not found</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink">There is nothing at this address</h1>
      <p className="mx-auto mt-2 max-w-md text-[15.5px] leading-relaxed text-muted">
        The link may be old, or the story may have been deleted. Everything in the newsroom is reachable from the dashboard.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/" className={buttonClass('navy')}>
          Go to the dashboard
        </Link>
        <Link to="/articles" className={buttonClass('outline')}>
          See all articles
        </Link>
      </div>
    </div>
  );
}
