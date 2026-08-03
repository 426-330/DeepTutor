import {registerRoot} from 'remotion';
// Side effect: registers the R3F skill renderer onto SkillHost (task 6.5).
import '../skills/renderer.js';
import {RemotionRoot} from './Root';

registerRoot(RemotionRoot);
