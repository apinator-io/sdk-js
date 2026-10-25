// Entry for the script-tag build (dist/apinator.min.js). It sets one global,
// `Apinator`, that is the client class itself, so `new Apinator({ ... })` works
// straight after the <script> tag. The other exports hang off it.
import { Apinator } from "./index";
import { Channel, PresenceChannel } from "./channel";

const global = Object.assign(Apinator, {
  // So code written for the module build, `const { Apinator } = ...`, works too.
  Apinator,
  Channel,
  PresenceChannel,
});

(globalThis as { Apinator?: typeof global }).Apinator = global;
