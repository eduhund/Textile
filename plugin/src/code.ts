import { SECRET } from "../config"

figma.showUI(__html__, { width: 270, height: 435 });

function generateRandomString(length: number) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let randomString = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    randomString += characters.charAt(randomIndex);
  }

  return randomString;
}

async function calculateSHA256(inputString: any) {
  const encoder = new TextEncoder();
  const data = encoder.encode(inputString);

  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashString = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');

  return hashString;
}

function createFileId() {
	const string = generateRandomString(16)
	const varColl = figma.variables.getLocalVariableCollections().find((item) => item.name === "Textile") || figma.variables.createVariableCollection("Textile")
	const newVariable = figma.variables.createVariable("textile_file_id", varColl?.id, "STRING")
	const mode = Object.keys(newVariable.valuesByMode)[0]
	newVariable.setValueForMode(mode, string)
	return string
}

function getFileId() {
	const variables = figma.variables.getLocalVariables("STRING")
	const IdVariable = variables.find((item) => item.name === "textile_file_id")
	const fileId: any = Object.values(IdVariable?.valuesByMode || {})[0] || createFileId()
	return fileId
}


const fileId = getFileId();

async function createCommentBadge(id: number) {
	const indicator = figma.createText();
	const frame = figma.createFrame();
	frame.name = `Comment #${id}`;
	frame.appendChild(indicator);
	const font = { family: "Inter", style: "Regular" };
	await figma.loadFontAsync(font);
	indicator.fontName = font;
	indicator.fontSize = 14;
	indicator.lineHeight = { value: 16, unit: "PIXELS" };
	indicator.characters = String(id);
	indicator.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
	frame.fills = [{ type: "SOLID", color: { r: 1, g: 0.4, b: 0.2 } }];

	frame.layoutMode = "HORIZONTAL";
	frame.layoutSizingHorizontal = "HUG";
	frame.layoutSizingVertical = "HUG";
	frame.primaryAxisAlignItems = "CENTER";

	frame.minWidth = 32;
	frame.paddingTop = 4;
	frame.paddingBottom = 4;
	frame.paddingLeft = 4;
	frame.paddingRight = 4;
	frame.cornerRadius = 8;
	frame.bottomRightRadius = 2;
	return frame;
}

async function createCommentText(content: string, id: number) {
	const font1 = { family: "Inter", style: "Regular" };
	const font2 = { family: "Inter", style: "Bold" };
	await figma.loadFontAsync(font1);
	await figma.loadFontAsync(font2);

	const commentNumber = figma.createText();
	commentNumber.fontName = font2;
	commentNumber.fontSize = 14;
	commentNumber.lineHeight = { value: 16, unit: "PIXELS" };
	commentNumber.characters = String(id);

	const text = figma.createText();
	text.fontName = font1;
	text.fontSize = 14;
	text.lineHeight = { value: 16, unit: "PIXELS" };
	text.characters = content;

	const frame = figma.createFrame();
	frame.name = `Comment #${id}`;
	frame.appendChild(commentNumber);
	frame.appendChild(text);

	frame.layoutMode = "HORIZONTAL";
	frame.layoutSizingVertical = "HUG";
	frame.itemSpacing = 8;

	return frame;
}

async function updateTextItem({ id, text }: any) {
	const node: any = figma.getNodeById(id);
	await Promise.all(
		node
			.getRangeAllFontNames(0, node.characters.length)
			.map(figma.loadFontAsync)
	);
	node.characters = text;

	return node;
}

function groupIndicators(indicators: FrameNode[]) {
	const indicatorsGroup = figma.group(indicators, figma.currentPage);
	indicatorsGroup.name = "CommentsBadges";
	indicatorsGroup.locked = true;
}

async function frameComments(comments: FrameNode[]) {
	const font = { family: "Montserrat", style: "Medium" };
	await figma.loadFontAsync(font);

	const header = figma.createText();
	header.fontName = font;
	header.fontSize = 32;
	header.lineHeight = { value: 36, unit: "PIXELS" };
	header.characters = "Editor's comments";

	const container = figma.createFrame();
	container.name = "CommentsContainer";
	comments.forEach((comment) => container.appendChild(comment));
	container.layoutMode = "VERTICAL";
	container.layoutSizingHorizontal = "HUG";
	container.itemSpacing = 8;

	const frame = figma.createFrame();
	frame.name = "CommentsList";
	frame.appendChild(header);
	frame.appendChild(container);
	frame.layoutMode = "VERTICAL";
	frame.layoutSizingHorizontal = "HUG";
	frame.itemSpacing = 16;

	frame.paddingTop = 20;
	frame.paddingBottom = 20;
	frame.paddingLeft = 16;
	frame.paddingRight = 16;

	figma.viewport.scrollAndZoomIntoView([frame]);
}

figma.ui.postMessage({ action: "SEND_ID", fileId });

figma.ui.onmessage = async (msg: any) => {
	const { action } = msg;

	const page = getCurrentPage();
	if (action === "PUSH_TEXTS") {
		const response = {
			pluginId: figma.pluginId,
			fileId,
			fileName: figma.root.name,
			pageId: page.id,
			pageName: page.name,
			frames: getFramesWithText(page),
			variables: provideVariables(),
		};
		try {
			const { OK, data, error }: any = await fetch(
				"https://textile.eduhund.com/api/pushData",
				{
					method: "POST",
					headers: {
						Authorization: SECRET,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(response),
				}
			).then((response) => response.json());
	
			if (OK) {
				figma.notify("Texts export sucessfully.");
			} else {
				figma.notify(`Request failed: ${error?.description}`, { error: true, timeout: 5000})
			}
		} catch {
			figma.notify("Request failed", { error: true, timeout: 5000 })
		} finally {
			figma.ui.postMessage({ action: "FETCH_RESPONSE", initAction: action });
		}
	}

	if (action === "PULL_TEXTS") {
		try {
			const { OK, data, error }: any = await fetch(
				`https://textile.eduhund.com/api/pullData?plughinId=${figma.pluginId}&fileId=${fileId}&pageId=${page.id}`,
				{
					method: "GET",
					headers: {
						Authorization: SECRET,
						"Content-Type": "application/json",
					},
				}
			).then((response) => response.json());
	
			if (OK) {
				const indicators = [];
				const comments = [];
				let commentCounter = 1;
	
				for (const { id, texts } of data.variables || []) {
					const figmaVariable: any = figma.variables.getVariableById(id) || {};
					Object.keys(figmaVariable.valuesByMode).forEach((key, i) => {
						if (texts[i]) {
							figmaVariable.setValueForMode(key, texts[i]);
						}
					});
				}
	
				for (const page of data.pages || []) {
					for (const frame of page.frames || []) {
						const frameNode: any = figma.getNodeById(frame?.id);
						frameNode.locked = false;
	
						for (const text of frame.texts || []) {
							const textNode = await updateTextItem(text);
							if (text.comment && text.comment.length > 0) {
								const commentBadge = await createCommentBadge(commentCounter);
								const commentText = await createCommentText(
									text.comment,
									commentCounter
								);
	
								const absNode = textNode.absoluteRenderBounds;
								const { x, y } = absNode;
								commentBadge.x = x - commentBadge.width;
								commentBadge.y = y - commentBadge.height;
	
								indicators.push(commentBadge);
								comments.push(commentText);
								commentCounter++;
							}
						}
					}
	
					if (indicators.length) {
						groupIndicators(indicators);
						await frameComments(comments);
					}
	
					figma.notify("New texts imported!");
				}
			} else {
				figma.notify(`Request failed: ${error?.description}`, { error: true, timeout: 5000 } )
			}
		} catch {
			figma.notify("Request failed", { error: true, timeout: 5000 })
		} finally {
			figma.ui.postMessage({ action: "FETCH_RESPONSE", initAction: action });
		}

	}

	if (action === "COPY_ID") {
		figma.notify("File ID has been copied to the clipboard");
	}
};

function getCurrentPage() {
	return figma.currentPage;
}

function isNumber(text: string) {
	try {
		const num = Number(text);
		if (typeof num === "number") return true;
		return false;
	} catch {
		throw false;
	}
}

function provideTexts(textNodes: any) {
	const textArray: any[] = [];
	for (const item of textNodes) {
		const { id, locked, visible, characters, variableConsumptionMap } = item;
		const variableId = variableConsumptionMap["TEXT_DATA"]?.value;
		if (characters.length < 2 || locked || !isNumber(characters)) continue;
		const text: any = {
			id,
			isHide: visible,
			variableId,
			text: characters,
		};
		textArray.push(text);
	}
	return textArray;
}

function provideVariables() {
	const variables = figma.variables.getLocalVariables("STRING");
	const variablesArray = variables.map(({ id, name, valuesByMode }) => {
		return {
			id,
			name,
			texts: Object.keys(valuesByMode).map((key) => valuesByMode[key]),
		};
	});
	return variablesArray;
}

function getFramesWithText(page: PageNode) {
	const pageFrames: any = page.findChildren((n) => n.type === "FRAME");

	const frames = []
	for (const frame of pageFrames) {
		const { id, name } = frame;
		const textNodes = frame.findAllWithCriteria({ types: ["TEXT"] });

		if (textNodes.length === 0) continue;

		frame.locked = true;
		frames.push({
			id,
			name,
			texts: provideTexts(textNodes),
		});
	}

	return frames
}