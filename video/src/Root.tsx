import { Composition, Folder } from "remotion";
import { Film, SCENE_COMPONENTS } from "./Film";
import { beat, DURATION, FPS, SCENES } from "./timeline";

export const Root: React.FC = () => (
  <>
    <Composition id="XbookFilm" component={Film} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
    <Folder name="Scenes">
      {SCENES.map((s) => (
        <Composition key={s.id} id={`scene-${s.id}`} component={SCENE_COMPONENTS[s.id]} durationInFrames={beat(s.to) - beat(s.from)} fps={FPS} width={1920} height={1080} />
      ))}
    </Folder>
  </>
);
