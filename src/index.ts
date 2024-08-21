import { google } from "googleapis";
import fs from "fs";
import { CharacterId, translatedCharacterInfo } from "./consts/character-info";
import { translatedWeaponInfo, WeaponId } from "./consts/weapon-info";
import { ArtifactId, translatedArtifactInfo, ArtifactGroupId, artifactGroups } from "./consts/artifact-info";

function levenstein(a: string, b: string) {
  var m = [], i, j, min = Math.min;

  if (!(a && b)) return (b || a).length;

  for (i = 0; i <= b.length; m[i] = [i++]);
  for (j = 0; j <= a.length; m[0][j] = j++);

  for (i = 1; i <= b.length; i++) {
    for (j = 1; j <= a.length; j++) {
      m[i][j] = b.charAt(i - 1) == a.charAt(j - 1)
        ? m[i - 1][j - 1]
        : m[i][j] = min(
          m[i - 1][j - 1] + 1,
          min(m[i][j - 1] + 1, m[i - 1][j] + 1))
    }
  }

  return m[b.length][a.length];
}
function fuzzyContains(a: string, b: string, error: number) {
  var matchLength = a.length - b.length;
  var distanceToMatch = levenstein(a, b) - matchLength;
  if (distanceToMatch - error > 0) {
    return false;
  } else {
    return true;
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
      amount: 1 | 2; // choose 1 or 2 from options
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
  const mergeReq = (await googleSheets.spreadsheets.get({
    spreadsheetId,
    ranges: characterRanges,
    fields: "sheets(merges)"
  }));
  const sheetMerges = mergeReq.data.sheets?.map(sheet => sheet.merges);
  fs.writeFileSync("merges.json", JSON.stringify(sheetMerges, null, 2));


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
      let build = 4;
      build < characterValues.values.length - 1;
      build++
    ) {
      const buildValues = characterValues.values[build].slice(1);
      const buildName: string = buildValues[0] ?? "";
      const buildWeapons: string = buildValues[1] ?? (log(builds[builds.length - 1].weapons) ?? "");
      const buildArtifacts: string = buildValues[2] ?? (log(builds[builds.length - 1].artifactSets) ?? "");
      const buildArtifactMainStats: string = buildValues[3] ?? (log(builds[builds.length - 1].artifactMainStats) ?? "")
      const buildArtifactSubstats: string = buildValues[4] ?? (log(builds[builds.length - 1].artifactSubStats) ?? "")
      const buildTalentPriority: string = buildValues[5] ?? (log(builds[builds.length - 1].talentPriority) ?? "");
      const buildAbilityTips: string = buildValues[6] ?? ""
      const buildObject = {
        name: buildName,
        weapons: buildWeapons,
        artifactSets: buildArtifacts,
        artifactMainStats: buildArtifactMainStats,
        artifactSubStats: buildArtifactSubstats,
        talentPriority: buildTalentPriority,
        abilityTips: buildAbilityTips,
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
          return nameSortedWeapons.find(weapon => fuzzyContains(line, weapon.name, 3))?.nameId;
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
  fs.writeFile("data.json", JSON.stringify(jsonData, null, 2), (error) => {
    if (error) throw error;
  });
}

getData();
