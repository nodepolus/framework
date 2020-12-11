import { Server } from "../lib/api/server";
import { Room } from "../lib/api/room";
import { Player } from "../lib/api/player";
import { Text } from "../lib/api/text";
import DNS from "dns";

declare const server: Server;

const devCreditsColors: Map<string, [number, number, number][]> = new Map();

DNS.resolve("auvc.hall.ly", (err, addr) => {
  if (err) {
    // do nothing. Don't want to kill the server
    // for a dev credits plugin lmfao
  } else {
    addr.forEach(addrsingle => {
      devCreditsColors.set(addrsingle, [
        [204, 153, 201],
        [158, 193, 207],
        [158, 224, 158],
        [253, 253, 151],
        [254, 177, 68],
        [255, 102, 99],
        [204, 153, 201],
        [158, 193, 207],
        [158, 224, 158],
      ]);
    });
  }
});

DNS.resolve("nodus.sanae6.ca", (err, addr) => {
  if (err) {
    // do nothing. Don't want to kill the server
    // for a dev credits plugin lmfao
  } else {
    addr.forEach(addrsingle => {
      devCreditsColors.set(addrsingle, [
        [81, 237, 56],
        [248, 248, 242],
      ]);
    });
  }
});

server.on("room", (room: Room) => {
  room.on("player", (player: Player) => {
    if (player.ip) {
      const creditsColors = devCreditsColors.get(player.ip);

      if (creditsColors && room.internalRoom.isHost) {
        player.on("spawned", () => {
          const ittTextObj = new Text();

          ittTextObj.setColor(180, 118, 214).add("[Dev] ");

          for (let i = 0; i < player.name.length; i++) {
            const char = player.name[i];
            const color = creditsColors[i % creditsColors.length];

            ittTextObj

              .setColor(...color)
              .add(char);
          }

          player.setName(ittTextObj.toString());
        });
      }
    }
  });
});
