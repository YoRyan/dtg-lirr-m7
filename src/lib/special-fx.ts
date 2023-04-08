/**
 * "Junk drawer" of special effect stuff.
 */

import * as frp from "./frp";
import { FrpEntity } from "./frp-entity";
import { rejectRepeats } from "./frp-extra";

/**
 * An animation wrapper that manages and tracks its current position.
 */
export class Animation {
    private target?: number = undefined;
    private readonly current: frp.Behavior<number>;

    constructor(e: FrpEntity, name: string, durationS: number) {
        const position$ = frp.compose(
            e.createUpdateStream(),
            frp.fold((current: number | undefined, dt) => {
                const target = this.target;
                if (current === undefined) {
                    // Jump instantaneously to the first value.
                    return target;
                } else if (target === undefined) {
                    return undefined;
                } else if (current > target) {
                    return Math.max(target, current - dt / durationS);
                } else if (current < target) {
                    return Math.min(target, current + dt / durationS);
                } else {
                    return current;
                }
            }, undefined),
            frp.map(current => current ?? 0),
            frp.hub()
        );
        this.current = frp.stepper(position$, 0);

        const setTime$ = frp.compose(
            position$,
            rejectRepeats(),
            frp.map(pos => pos * durationS)
        );
        setTime$(t => {
            e.re.SetTime(name, t);
        });
    }

    /**
     * Set the target position for this animation, scaled from 0 to 1.
     */
    setTargetPosition(position: number) {
        this.target = position;
    }

    /**
     * Get the current position of this animation, scaled from 0 to 1.
     */
    getPosition() {
        return frp.snapshot(this.current);
    }
}
