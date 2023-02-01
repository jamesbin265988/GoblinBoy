import { useEffect, useRef, useState } from "react";
import { Log, HoverMenu, ControlOverlay, HoverMenuProps } from "./components";
import { initializeGame } from "./game/main";
import {
  DialogueMap,
  EntityData,
  EntityIndex,
  ServerMessageSingleClient,
} from "./utility/types";
import { DirectionHandlers, GameInputState } from "./game/input";
import "./App.css";
import {
  NpcDialogue,
  NpcDialogueProps,
} from "./components/NpcDialogue/NpcDialogue";
import { MainTitle } from "./components/MainTitle/MainTitle";
import { DebugMenu, DebugMenuProps } from "./components/DebugMenu/DebugMenu";
import {
  DamageNumber,
  DamageNumberProps,
} from "./components/DamageNumber/DamageNumber";
import { PlayerStats } from "./components/PlayerStats/PlayerStats";

const music = new Audio("audio/music/supersewerslug.ogg");

const gameInputState: GameInputState = { enabled: true };

let spawnHandler: () => void | undefined;

const PLAYER_SPRITE_NAMES = [
  "KidZilla",
  "Ghost Boy",
  "Boney Boy",
  "Ant Boy",
  "Sewer Kid",
] as const;

export type PlayerSpriteName = typeof PLAYER_SPRITE_NAMES[number];

export type PlayerStats = Extract<
  ServerMessageSingleClient,
  { type: "showDamage" }
>["content"];

const App = () => {
  const initialized = useRef<boolean>(false);
  const canvasContainer = useRef<HTMLDivElement | null>(null);
  const logContainer = useRef<HTMLDivElement | null>(null);

  const [hoverMenu, setHoverMenu] = useState<HoverMenuProps>();
  const [npcDialogueMenu, setNpcDialogueMenu] = useState<NpcDialogueProps>();
  const [log, setLog] = useState<string[]>([]);
  const [moveCount, setMoveCount] = useState<number>();
  const [directionHandlers, setDirectionHandlers] =
    useState<DirectionHandlers>();
  const [enableMainTitle, setEnableMainTitle] = useState<boolean>(false);

  const [debugMenuProps, setDebugMenuProps] = useState<DebugMenuProps>();

  const [damageNumbers, setDamageNumbers] = useState<Array<DamageNumberProps>>(
    []
  );

  const [startGame, setStartGame] = useState(false);

  const [playerSprite, setPlayerSprite] =
    useState<PlayerSpriteName>("KidZilla");

  const [playerName, setPlayerName] = useState<string>("Player");

  const [playerStats, setPlayerStats] = useState<PlayerStats>();

  const onHover = (x: number, y: number, entityData?: EntityData) => {
    if (!entityData) {
      setHoverMenu(undefined);
    } else {
      setHoverMenu({ menuPosition: { x, y }, entityData });
    }
  };

  const addLogEntry = (logEntry: string) => {
    setLog((oldLog) => [logEntry, ...oldLog]);
  };

  const onClick = addLogEntry;
  const onDamage = addLogEntry;
  const onDeath = addLogEntry;

  const onDialogueClose = () => {
    gameInputState.enabled = true;
    setNpcDialogueMenu(undefined);
  };

  const onDialogue = (
    nameAndDialogueMap: NpcDialogueProps["nameAndDialogueMap"]
  ) => {
    setNpcDialogueMenu({
      nameAndDialogueMap,
      onClose: onDialogueClose,
    });

    gameInputState.enabled = false;
    // setTimeout(() => {
    //   setNpcDialogueMenu(undefined);
    // }, 2000);
  };

  // Queries the server for the game configuration (to determine the canvas size)
  // and then initializes the game.  Will only fire once (due to `initialized` check)
  // so the game state will persist during Vite dev server hot reloading
  useEffect(() => {
    if (startGame) {
      if (initialized.current === false) {
        initialized.current = true;
        initializeGame(
          onHover,
          onClick,
          onDeath,
          onDamage,
          setMoveCount,
          onDialogue,
          gameInputState,
          setDebugMenuProps,
          (payload) => setDamageNumbers((prev) => [...prev, payload]),
          playerSprite,
          playerName,
          setPlayerStats
        ).then(({ gameCanvas, directionHandlers: dirHandlers, spawnSlime }) => {
          spawnHandler = spawnSlime;
          setDirectionHandlers(dirHandlers);
          canvasContainer.current?.appendChild(gameCanvas);
          let canvasHeight = gameCanvas.height;
          const canvasWidth = gameCanvas.width;

          if (canvasContainer.current && logContainer.current) {
            canvasContainer.current.style.height = canvasHeight + "px";
            logContainer.current.style.width = canvasWidth + "px";

            // Log height is shorter on mobile
            if (window.matchMedia("(max-width: 600px)").matches) {
              canvasHeight = Math.floor(canvasHeight / 2);
            }

            logContainer.current.style.height = canvasHeight + "px";
          }

          gameCanvas.onmouseleave = () => {
            setHoverMenu(undefined);
          };
        });
      }
    }
  }, [startGame]);

  const onChangeValue: React.FormEventHandler<HTMLDivElement> = (event) => {
    const target = event.target as HTMLInputElement;
    setPlayerSprite(target.value as PlayerSpriteName);
  };

  return (
    <>
      {startGame === false ? (
        <div>
          <div onChange={onChangeValue}>
            {PLAYER_SPRITE_NAMES.map((spriteName, idx) => {
              return (
                <div key={idx}>
                  <label htmlFor={spriteName}>{spriteName}</label>
                  <input
                    type="radio"
                    id={spriteName}
                    value={spriteName}
                    name="playerSprite"
                    checked={playerSprite === spriteName}
                  />
                </div>
              );
            })}
          </div>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
          />
          <button onClick={() => setStartGame(true)}>OK GO</button>
        </div>
      ) : (
        <>
          {debugMenuProps && <DebugMenu {...debugMenuProps} />}
          <button
            onClick={() => {
              setEnableMainTitle((oldVal) => !oldVal);
            }}
          >
            Test title sequence
          </button>
          <button
            onClick={() => {
              if (music.currentTime === 0) {
                music.play();
                music.loop = true;
              } else {
                music.pause();
              }
            }}
          >
            Test music
          </button>
          <button
            onClick={() => {
              spawnHandler?.();
            }}
          >
            Spawn a Slime
          </button>
          {enableMainTitle && <MainTitle />}
          {!enableMainTitle && (
            <div className="game-container">
              <p>All time totals moves: {moveCount}</p>

              <div className="canvas-and-log-container">
                <div className="canvas-container" ref={canvasContainer}>
                  {damageNumbers.map((damProps, idx) => (
                    <DamageNumber key={idx} {...damProps} />
                  ))}
                  {/* {hoverMenu && <HoverMenu {...hoverMenu} />} */}
                  {npcDialogueMenu && <NpcDialogue {...npcDialogueMenu} />}
                  {/* {directionHandlers && (
              <ControlOverlay directionHandlers={directionHandlers} />
            )} */}
                </div>
                <div ref={logContainer} className="log-container">
                  <Log log={log} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "row" }}>
                Hp: {playerStats && <PlayerStats playerStats={playerStats} />}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default App;
