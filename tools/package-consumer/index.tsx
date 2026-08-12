import { ArcadeGame, type ArcadeGameProps } from "archive-defender";
import { ARCADE_OPENING_TRACK_URL } from "archive-defender/launch";
import "archive-defender/style.css";

const props = { startup: "title" } satisfies ArcadeGameProps;

export const packageConsumerFixture = {
  element: <ArcadeGame {...props} />,
  openingTrackUrl: ARCADE_OPENING_TRACK_URL,
};
