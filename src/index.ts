import { google } from "googleapis";
import fs from "fs";
import { CharacterId, translatedCharacterInfo } from "./consts/character-info";
import { translatedWeaponInfo, WeaponId } from "./consts/weapon-info";
import { ArtifactId, translatedArtifactInfo, ArtifactGroupId, artifactGroups } from "./consts/artifact-info";

function levenstein(s1: string, s2: string, opts: { insWeight?: number, delWeight?: number, subWeight?: number, useDamerau?: boolean } = {}) {
  const insWeight = opts.insWeight ?? 1;
  const delWeight = opts.delWeight ?? 1;
  const subWeight = opts.subWeight ?? 1;
  const useDamerau = opts.useDamerau ?? false;
  let d: number[][] = [];

  if (s1.length === 0) {
    // if s1 string is empty, just insert the s2 string
    return s2.length * insWeight;
  }

  if (s2.length === 0) {
    // if s2 string is empty, just delete the s1 string
    return s1.length * delWeight;
  }

  // Init the matrix
  for (let i = 0; i <= s1.length; i += 1) {
    d[i] = [];
    d[i][0] = i * delWeight;
  }

  for (let j = 0; j <= s2.length; j += 1) {
    d[0][j] = j * insWeight;
  }

  for (let i = 1; i <= s1.length; i += 1) {
    for (let j = 1; j <= s2.length; j += 1) {
      let subCostIncrement = subWeight;
      if (s1.charAt(i - 1) === s2.charAt(j - 1)) {
        subCostIncrement = 0;
      }

      const delCost = d[i - 1][j] + delWeight;
      const insCost = d[i][j - 1] + insWeight;
      const subCost = d[i - 1][j - 1] + subCostIncrement;

      let min = delCost;
      if (insCost < min) min = insCost;
      if (subCost < min) min = subCost;


      if (useDamerau) {
        if (i > 1 && j > 1
          && s1.charAt(i - 1) === s2.charAt(j - 2)
          && s1.charAt(i - 2) === s2.charAt(j - 1)) {
          const transCost = d[i - 2][j - 2] + subCostIncrement;

          if (transCost < min) min = transCost;
        }
      }


      d[i][j] = min;
    }
  }

  return d[s1.length][s2.length];
};

function fuzzyContains(a: string, b: string, error: number): [boolean, number] {
  var matchLength = a.length - b.length;
  var distanceToMatch = levenstein(a, b, { useDamerau: true }) - matchLength;
  if (distanceToMatch - error > 0) {
    return [false, distanceToMatch];
  } else {
    return [true, distanceToMatch];
  }
}

const log = <T>(a: T) => {
  console.log("LOG:", a);
  return a;
}

type UnmodifiedCharacterBuild = {
  weapons: string;
  artifactSets: string;
  artifactMainStats: string;
  artifactSubStats: string;
  talentPriority: string;
  abilityTips: string;
};

type CharacterBuild = {
  weapons: WeaponId[];
  artifactSets: (
    ArtifactId | { type: "group", id: ArtifactGroupId }
    | {
      type: "choose",
      amount: 1 | 2; // choose 1 (4pc) or 2 (2pc) from options
      options: (ArtifactId | { type: "group", id: ArtifactGroupId })[]
    }
    | {
      type: "double",
      options: [(ArtifactId | { type: "group", id: ArtifactGroupId }), (ArtifactId | { type: "group", id: ArtifactGroupId })]
    }
  )[];
  artifactMainStats: string;
  artifactSubStats: string;
  talentPriority: string;
  abilityTips: string;
}

async function getData() {
  const allCharacterInfo = translatedCharacterInfo();
  const allWeaponInfo = translatedWeaponInfo();
  const nameSortedWeapons = allWeaponInfo.sort((a, b) => b.name.length - a.name.length);
  const allArtifactInfo = translatedArtifactInfo();
  const nameSortedArtifacts = allArtifactInfo.sort((a, b) => b.name.length - a.name.length);
  const nameSortedArtifactGroups = [...artifactGroups].sort((a, b) => b.name.length - a.name.length);
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: "https://www.googleapis.com/auth/spreadsheets.readonly",
  });
  const client = await auth.getClient();
  const googleSheets = google.sheets({ version: "v4", auth: client });
  const spreadsheetId = "1gNxZ2xab1J6o1TuNVWMeLOZ7TPOqrsf3SshP5DLvKzI";
  let sheetNames = ["Pyro ", "Electro ", "Hydro ", "Cryo ", "Anemo ", "Geo ", "Dendro"];
  let jsonData: any[] = [];
  const bRowRanges: string[] = sheetNames.map(
    (sheetName) => `${sheetName}!B:B`
  );
  console.log(bRowRanges);
  const bRows = await googleSheets.spreadsheets.values.batchGet({
    auth,
    spreadsheetId,
    ranges: bRowRanges,
  });
  const valueRanges = bRows.data.valueRanges;
  let characterRanges: string[] = [];
  if (!valueRanges) return;
  for (let i = 0; i < valueRanges.length; i++) {
    const bRow = valueRanges[i].values;
    let last_j = 0;
    if (!bRow) continue
    for (let j = 0; j < bRow.length; j++) {
      const cell: string = bRow[j][0];
      if (!cell) continue;
      if (!cell.toLowerCase().includes("notes")) {
        last_j = j;
      } else {
        const characterRange: string = `${sheetNames[i]}!B${j + 1}:I${last_j + 1
          }`;
        characterRanges.push(characterRange);
      }
    }
  }
  const characterData = await googleSheets.spreadsheets.values.batchGet({
    auth,
    spreadsheetId,
    ranges: characterRanges,
  });

  console.log(characterRanges.length);
  const characterValueRanges = characterData.data.valueRanges;
  if (!characterValueRanges) return;
  for (let i = 0; i < characterValueRanges.length; i++) {
    const characterValues = characterValueRanges[i];
    if (!characterValues || !characterValues.values) continue;
    const viewName: string = (
      characterValues.values
    )[0][0].replaceAll("\n", " ");
    const searchRes = allCharacterInfo.find(
      (character) => character.name.toLowerCase() === viewName.toLowerCase()
    );
    if (!searchRes) {
      console.log(`viewName: ${viewName} not found`);
      continue;
    }
    const nameId: CharacterId = searchRes.nameId;
    const element: string = searchRes.vision;

    let builds: UnmodifiedCharacterBuild[] = [];
    const weapon = searchRes.weaponType;
    const notes: string =
      characterValues.values
        ? characterValues.values?.slice(-1)[0][1]
        : "";
    if (!characterValues.values) continue;
    for (
      let build = 4; // start at 4 to skip the first 4 rows which don't contain build info
      build < characterValues.values.length - 1;
      build++
    ) {
      const buildValues = characterValues.values[build].slice(1);
      const buildObject = {
        name: buildValues[0] ?? "",
        weapons: buildValues[1] ?? (log(builds[builds.length - 1].weapons) ?? ""),
        artifactSets: buildValues[2] ?? (log(builds[builds.length - 1].artifactSets) ?? ""),
        artifactMainStats: buildValues[3] ?? (log(builds[builds.length - 1].artifactMainStats) ?? ""),
        artifactSubStats: buildValues[4] ?? (log(builds[builds.length - 1].artifactSubStats) ?? ""),
        talentPriority: buildValues[5] ?? (log(builds[builds.length - 1].talentPriority) ?? ""),
        abilityTips: buildValues[6] ?? "",
      };
      // console.log(buildObject);
      builds.push(buildObject);
    }
    console.log(builds);
    // sort weapons in descending order based on name length
    const modifiedBuilds: CharacterBuild[] = builds.map(({ weapons, artifactSets, ...rest }) => {
      return {
        ...rest,
        // weapons: weapons.split("\n").map((line: string) => {
        //   let weapons = [];
        //   let changed = true;
        //   while (changed) {
        //     changed = false;
        //     for (let weapon of nameSortedWeapons) {
        //       const indexOf = line.indexOf(weapon.name);
        //       if (indexOf) {
        //         weapons.push(weapon.nameId);
        //         line = line.slice(0, indexOf) + line.slice(indexOf + weapon.name.length);
        //         changed = true;
        //       }
        //     }
        //   }
        // })
        weapons: weapons.split("\n").map((line: string) => {
          return (nameSortedWeapons.filter((a) => a.type === weapon).map(weapon => {
            const [contains, distanceToMatch] = fuzzyContains(line, weapon.name, 3);
            if (contains) {
              return [weapon.nameId, distanceToMatch];
            }
            return undefined;
          }).filter(a => a) as [WeaponId, number][]).reduce((acc: [WeaponId, number] | undefined, curr: [WeaponId, number]) => {
            if (!acc) return curr;
            if (curr[1] < acc[1]) return curr;
            if (curr[1] === acc[1] && (allWeaponInfo.find(e => e.nameId === curr[0])?.name?.length ?? 0) < (allWeaponInfo.find(e => e.nameId === acc[0])?.name?.length ?? 0)) return curr;
            return acc;
          }, undefined)?.[0];
        }).filter((a: string | undefined) => a) as WeaponId[],
        artifactSets: artifactSets.split("\n").map((line: string) => allArtifactInfo.find(artifact => line.includes(artifact.name))?.nameId).filter((a: string | undefined) => a) as ArtifactId[],
        // artifactSets: artifactSets.split("\n").map((line: string) => {
        //   let sets = [];
        //   let changed = true;
        //   while (changed) {
        //     changed = false;
        //     for (let artifact of nameSortedArtifacts) {
        //       const indexOf = line.indexOf(artifact.name);
        //       if (indexOf >= 0) {
        //         sets.push(artifact.nameId);
        //         line = line.slice(0, indexOf) + line.slice(indexOf + artifact.name.length);
        //         changed = true;
        //       }
        //     }
        //     for (let group of nameSortedArtifactGroups) {
        //       const indexOf = line.indexOf(group.name);
        //       if (indexOf >= 0) {
        //         sets.push({ type: "group", id: group.nameId });
        //         line = line.slice(0, indexOf) + line.slice(indexOf + group.name.length);
        //         changed = true;
        //       }
        //     }
        //   }
        //   if (sets.length === 0) { return undefined; }
        //   else if (sets.length === 1) {
        //     return sets[0];
        //   } else if (sets.length === 2) {
        //     return {
        //       type: "double",
        //       options: [sets[0], sets[1]]
        //     };
        //   } else {
        //     return {
        //       type: "choose",
        //       amount: 2,
        //       options: sets
        //     };
        //   }
        // }).filter(a => a) as ArtifactId[],
      }
    });
    // console.log(
    //   `viewName: ${viewName} name: ${name} element: ${element} weapon: ${weapon}\n\tnotes: ${notes}\n`
    // );
    const character = {
      nameId,
      element,
      weapon,
      notes,
      builds: modifiedBuilds,
    };
    jsonData.push(character);
  }
  fs.writeFile("out/data.json", JSON.stringify(jsonData, null, 2), (error) => {
    if (error) throw error;
  });
}

getData();
