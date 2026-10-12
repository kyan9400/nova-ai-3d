/*
  Server component: splits a heading into words for the CSS scroll reveal (globals.css, ".w").
  Spaces stay real text nodes, so screen readers still read one normal sentence.
  text = the plain part, em = the highlighted tail (signal yellow). Never used on the H1 (it is the LCP).
*/
import { Fragment } from "react";

function words(text: string, start: number) {
  return text
    .split(" ")
    .filter(Boolean)
    .map((word, i) => (
      <Fragment key={i}>
        {i > 0 && " "}
        <span className="w" style={{ "--i": start + i } as React.CSSProperties}>
          <span>{word}</span>
        </span>
      </Fragment>
    ));
}

export default function SplitWords({ text, em }: { text: string; em?: string }) {
  const count = text.split(" ").filter(Boolean).length;
  return (
    <>
      {words(text, 0)}
      {em && (
        <>
          {" "}
          <em>{words(em, count)}</em>
        </>
      )}
    </>
  );
}
