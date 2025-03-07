async function generate_image_with_recraft_v3(params, userSettings) {
  const { prompt } = params;
  const { fal_ai_api_key, image_size = "square_hd", style = "realistic_image", colors = "" } = userSettings;

  const endpoint = "https://queue.fal.run/fal-ai/recraft-v3";

  let colorsArray = [];
  if (colors) {
    const colorValues = colors.split(",").map(s => s.trim());
    for (let i = 0; i < colorValues.length; i += 3) {
      if (i + 2 < colorValues.length) {
        const r = parseInt(colorValues[i]);
        const g = parseInt(colorValues[i + 1]);
        const b = parseInt(colorValues[i + 2]);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b) && r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
          colorsArray.push({ r, g, b });
        } else {
          console.warn(`Invalid color value: ${colorValues[i]},${colorValues[i + 1]},${colorValues[i + 2]}. Ignoring.`);
        }
      }
    }
  }

  const requestBody = {
    prompt,
    image_size,
    style,
    colors: colorsArray
  };

  try {
    const submitResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Key ${fal_ai_api_key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!submitResponse.ok) {
      const errorBody = await submitResponse.text();
      throw new Error(`Fal.ai API request failed: ${submitResponse.status} - ${errorBody}`);
    }

    const { request_id } = await submitResponse.json();
    if (!request_id) {
      throw new Error("Did not receive a request_id from Fal.ai API.");
    }

    let result = null;
    const maxAttempts = 60;
    const pollInterval = 5000;
    for (let attempts = 0; attempts < maxAttempts && !result; attempts++) {
      const statusResponse = await fetch(
        `https://queue.fal.run/fal-ai/recraft-v3/requests/${request_id}/status`,
        {
          headers: {
            "Authorization": `Key ${fal_ai_api_key}`
          }
        }
      );

      if (!statusResponse.ok) {
        const errorBody = await statusResponse.text();
        throw new Error(`Fal.ai status check failed: ${statusResponse.status} - ${errorBody}`);
      }

      const statusJson = await statusResponse.json();

      if (statusJson.status === "COMPLETED") {
        const resultResponse = await fetch(
          `https://queue.fal.run/fal-ai/recraft-v3/requests/${request_id}`,
          {
            headers: {
              "Authorization": `Key ${fal_ai_api_key}`
            }
          }
        );

        if (!resultResponse.ok) {
          const errorBody = await resultResponse.text();
          throw new Error(`Fal.ai result fetch failed: ${resultResponse.status} - ${errorBody}`);
        }

        result = await resultResponse.json();
        break;
      } else if (statusJson.status === "FAILED") {
        throw new Error(`Fal.ai request failed: ${statusJson.error}`);
      }

      if (!result) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    if (!result) {
      throw new Error(`Fal.ai request timed out after ${maxAttempts} attempts.`);
    }

    if (result.images?.length > 0) {
      let markdownOutput = "";
      for (const image of result.images) {
        const altText = prompt.substring(0, 100) || "Generated Image";
        markdownOutput += `![${altText}](${image.url})\n\n`;
      }
      return markdownOutput;
    } else {
      return "No images were generated.";
    }

  } catch (error) {
    return `**Error:** ${error.message}`;
  }
}
