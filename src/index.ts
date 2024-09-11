import { google } from "googleapis";
import fs from "fs";
import { CharacterId, translatedCharacterInfo } from "./consts/character-info";
import { translatedWeaponInfo, WeaponId } from "./consts/weapon-info";
import { ArtifactId, translatedArtifactInfo, ArtifactGroupId, artifactGroups } from "./consts/artifact-info";
import Fuse from "fuse.js";

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

type ArtifactSetChoice = { type: "set", id: ArtifactId } | { type: "group", id: ArtifactGroupId };

type CharacterBuild = {
  weapons: WeaponId[];
  artifactSets: (
    { type: "single", option: ArtifactSetChoice }
    | {
      type: "choose-2",
      options: ArtifactSetChoice[]
    }
    | {
      type: "double",
      options: [ArtifactSetChoice, ArtifactSetChoice]
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
  const fuseOptions = {
    keys: ["name"],
    includeScore: true,
    threshold: 0.5,
  };
  const swordFuse = new Fuse(allWeaponInfo.filter(weapon => weapon.type === "sword"), fuseOptions);
  const claymoreFuse = new Fuse(allWeaponInfo.filter(weapon => weapon.type === "claymore"), fuseOptions);
  const polearmFuse = new Fuse(allWeaponInfo.filter(weapon => weapon.type === "polearm"), fuseOptions);
  const bowFuse = new Fuse(allWeaponInfo.filter(weapon => weapon.type === "bow"), fuseOptions);
  const catalystFuse = new Fuse(allWeaponInfo.filter(weapon => weapon.type === "catalyst"), fuseOptions);
  const allArtifactInfo = translatedArtifactInfo();
  const auth = new google.auth.GoogleAuth({
    keyFile: "credentials.json",
    scopes: "https://www.googleapis.com/auth/spreadsheets.readonly",
  });
  const googleSheets = google.sheets("v4");
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
      builds.push(buildObject);
    }
    const modifiedBuilds: CharacterBuild[] = builds.map(({ weapons: _weapons, artifactSets, ...rest }) => {
      const weapons = _weapons.split("\n").filter(line => line).map((line: string) => {
        switch (weapon) {
          case "sword":
            return swordFuse.search(line)?.[0]?.item?.nameId;
          case "claymore":
            return claymoreFuse.search(line)?.[0]?.item?.nameId;
          case "polearm":
            return polearmFuse.search(line)?.[0]?.item?.nameId;
          case "catalyst":
            return catalystFuse.search(line)?.[0]?.item?.nameId;
          case "bow":
            return bowFuse.search(line)?.[0]?.item?.nameId;
        }
      }).filter(a => a) as WeaponId[];
      return {
        ...rest,
        weapons,
        artifactSets: artifactSets.split("\n").map((line: string) => {
          let sets = [];
          let changed = true;
          while (changed) {
            changed = false;
            for (let artifact of allArtifactInfo) {
              const indexOf = line.indexOf(artifact.name);
              if (indexOf >= 0) {
                sets.push({ type: "set", id: artifact.nameId });
                line = line.slice(0, indexOf) + line.slice(indexOf + artifact.name.length);
                changed = true;
              }
            }
            for (let group of artifactGroups) {
              const indexOf = line.indexOf(group.name);
              if (indexOf >= 0) {
                sets.push({ type: "group", id: group.nameId });
                line = line.slice(0, indexOf) + line.slice(indexOf + group.name.length);
                changed = true;
              }
            }
          }
          if (sets.length === 0) { return undefined; }
          else if (sets.length === 1) {
            return { type: "single", option: sets[0] };
          } else if (sets.length === 2) {
            return {
              type: "double",
              options: [sets[0], sets[1]]
            };
          } else {
            return {
              type: "choose-2",
              options: sets
            };
          }
        }).filter(a => a) as CharacterBuild["artifactSets"],
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
