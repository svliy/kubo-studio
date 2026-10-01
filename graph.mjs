// Lay out a topologically ordered commit DAG. Edges follow actual parent hashes.
export function layoutGraph(commits) {
  const palette = ['#b49cdb', '#a8bd80', '#d2ad79', '#83b9af', '#c98da5'];
  let lanes = [], nextColor = 0, maxLanes = 1;
  const rows = commits.map(commit => {
    let lane = lanes.findIndex(item => item.hash === commit.hash);
    const startsHere = lane < 0;
    if (startsHere) {
      lane = lanes.length;
      lanes.push({ hash: commit.hash, color: palette[nextColor++ % palette.length] });
    }
    const before = lanes.slice(), color = before[lane].color;
    lanes.splice(lane, 1);
    let insertion = Math.min(lane, lanes.length);
    for (const [index, parent] of commit.parents.entries()) {
      if (lanes.some(item => item.hash === parent)) continue;
      lanes.splice(insertion++, 0, { hash: parent, color: index === 0 ? color : palette[nextColor++ % palette.length] });
    }
    const after = lanes.slice();
    maxLanes = Math.max(maxLanes, before.length, after.length);
    const continuations = before.flatMap((item, from) => {
      if (item.hash === commit.hash) return [];
      return [{ from, to: after.findIndex(target => target.hash === item.hash), color: item.color }];
    });
    const parents = commit.parents.map(parent => {
      const to = after.findIndex(item => item.hash === parent);
      return { from: lane, to, color: after[to].color, hash: parent };
    });
    return { commit, lane, color, startsHere, continuations, parents };
  });
  return { rows, width: maxLanes * 18 + 22 };
}
