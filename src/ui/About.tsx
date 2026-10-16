// About & credits section for the Settings panel: version, shortcuts, and who made what.
export function About() {
  return (
    <>
      <h3>Keyboard</h3>
      <ul className="keys">
        <li><kbd>Tab</kbd> move between members in the gym · <kbd>Enter</kbd> open their profile</li>
        <li><kbd>Space</kbd> pause · <kbd>1</kbd> <kbd>2</kbd> <kbd>4</kbd> speed · <kbd>A</kbd> aura · <kbd>F</kbd> follow yourself</li>
        <li><kbd>Y</kbd> you · <kbd>H</kbd> Hall of Fame · <kbd>M</kbd> music · <kbd>S</kbd> settings · <kbd>Esc</kbd> close</li>
      </ul>
      <h3>About &amp; credits</h3>
      <p className="muted small">
        Mini Gym {__APP_VERSION__} ({__APP_COMMIT__}). Characters from the Ultimate Animated Character Pack by Quaternius (CC0).
        Equipment, exercise animation, artwork, icons, sound effects and Gym Radio are original and made in code. Font: Nunito (SIL Open Font License). Built with three.js, React Three Fiber, drei, postprocessing,
        N8AO, zustand and idb-keyval. Spotify is a trademark of Spotify AB; Mini Gym isn't affiliated with Spotify.{' '}
        <a href={`${import.meta.env.BASE_URL}CREDITS.md`} target="_blank" rel="noreferrer">Full credits</a>
      </p>
    </>
  );
}
