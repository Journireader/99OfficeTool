'use strict';

/**
 * 读取一个 Spine 动作里 EventTimeline 的事件名。
 * Action 表按事件名配置行为，同名事件即使出现多次也只需要一组配置。
 * @param {*} animation
 * @returns {string[]}
 */
function getAnimationEventNames(animation) {
    const result = [];
    const seen = new Set();
    const timedEvents = [];
    const timelines = animation && Array.isArray(animation.timelines) ? animation.timelines : [];
    timelines.forEach((timeline) => {
        if (!timeline || !Array.isArray(timeline.events)) {
            return;
        }
        timeline.events.forEach((event, index) => {
            const name = event && event.data && event.data.name
                ? String(event.data.name)
                : (event && event.name ? String(event.name) : '');
            if (!name) {
                return;
            }
            const frameTime = timeline.frames && Number(timeline.frames[index]);
            const eventTime = Number(event.time);
            timedEvents.push({
                name,
                time: Number.isFinite(eventTime)
                    ? eventTime
                    : (Number.isFinite(frameTime) ? frameTime : index),
                index: timedEvents.length,
            });
        });
    });
    timedEvents.sort((a, b) => (a.time - b.time) || (a.index - b.index));
    timedEvents.forEach((item) => {
        if (!seen.has(item.name)) {
            seen.add(item.name);
            result.push(item.name);
        }
    });
    return result;
}

module.exports = { getAnimationEventNames };
