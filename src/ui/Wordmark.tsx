import "./wordmark.css";

// ASCII art in the style of FIGlet's "ANSI Shadow", generated once (by hand-drawn glyphs) and kept as constants.
// "DB" is sheared one column per row, so it leans like italic. Two layouts: one line, and stacked for narrow screens.
const WIDE = `
██████╗ ███████╗██╗     ███████╗██╗   ██╗██╗███╗   ██╗        ██████╗ ██████╗
██╔══██╗██╔════╝██║     ██╔════╝██║   ██║██║████╗  ██║       ██╔══██╗██╔══██╗
██████╔╝█████╗  ██║     █████╗  ██║   ██║██║██╔██╗ ██║      ██║  ██║██████╔╝
██╔═══╝ ██╔══╝  ██║     ██╔══╝  ╚██╗ ██╔╝██║██║╚██╗██║     ██║  ██║██╔══██╗
██║     ███████╗███████╗███████╗ ╚████╔╝ ██║██║ ╚████║    ██████╔╝██████╔╝
╚═╝     ╚══════╝╚══════╝╚══════╝  ╚═══╝  ╚═╝╚═╝  ╚═══╝   ╚═════╝ ╚═════╝
`.slice(1, -1);
const STACKED = `
██████╗ ███████╗██╗     ███████╗██╗   ██╗██╗███╗   ██╗
██╔══██╗██╔════╝██║     ██╔════╝██║   ██║██║████╗  ██║
██████╔╝█████╗  ██║     █████╗  ██║   ██║██║██╔██╗ ██║
██╔═══╝ ██╔══╝  ██║     ██╔══╝  ╚██╗ ██╔╝██║██║╚██╗██║
██║     ███████╗███████╗███████╗ ╚████╔╝ ██║██║ ╚████║
╚═╝     ╚══════╝╚══════╝╚══════╝  ╚═══╝  ╚═╝╚═╝  ╚═══╝

                                      ██████╗ ██████╗
                                     ██╔══██╗██╔══██╗
                                    ██║  ██║██████╔╝
                                   ██║  ██║██╔══██╗
                                  ██████╔╝██████╔╝
                                 ╚═════╝ ╚═════╝
`.slice(1, -1);

/**
 * The PelevinDB logo as block-letter art. Both sizes render the one-line and the stacked layout and let CSS
 * pick: `header` is small (about 6px per cell, stacked on phones), `hero` scales to its container.
 * Ink only, both themes. The art is decorative; the wrapper carries the name.
 */
export function Wordmark({ size }: { size: "header" | "hero" }) {
  return (
    <span className={`wordmark wordmark-${size}`} role="img" aria-label="PelevinDB">
      <pre className="wordmark-art wordmark-art-wide" aria-hidden="true">
        {WIDE}
      </pre>
      <pre className="wordmark-art wordmark-art-stacked" aria-hidden="true">
        {STACKED}
      </pre>
    </span>
  );
}
