import os
import base64
import subprocess
import json
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables
load_dotenv()


class VisionScraper:
    def __init__(self):
        """Initialize the VisionScraper with OpenAI client"""
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        if not os.getenv("OPENAI_API_KEY"):
            raise ValueError("OPENAI_API_KEY not found in environment variables")

    def encode_image(self, image_path):
        """Convert image file to base64 format for GPT-4V"""
        try:
            with open(image_path, "rb") as image_file:
                return base64.b64encode(image_file.read()).decode("utf-8")
        except FileNotFoundError:
            raise FileNotFoundError(f"Image file not found: {image_path}")
        except Exception as e:
            raise Exception(f"Error encoding image: {str(e)}")

    def take_screenshot(self, url, timeout=30000):
        """Take screenshot using the screenshot.js Node.js script"""
        # Remove existing screenshot if it exists
        screenshot_path = "screenshot.jpg"
        if os.path.exists(screenshot_path):
            os.remove(screenshot_path)
            print("Removed existing screenshot")

        try:
            # Run the Node.js screenshot script
            print(f"Taking screenshot of: {url}")
            result = subprocess.run(
                ["node", "screenshot.js", url, str(timeout)],
                capture_output=True,
                text=True,
                timeout=timeout / 1000 + 10,
            )

            if result.returncode != 0:
                raise Exception(f"Screenshot script failed: {result.stderr}")

            print("Screenshot taken successfully")
            return screenshot_path

        except subprocess.TimeoutExpired:
            raise Exception("Screenshot process timed out")
        except Exception as e:
            raise Exception(f"Error taking screenshot: {str(e)}")

    def analyze_screenshot(
        self, image_path, prompt, model="gpt-4-vision-preview", max_tokens=1000
    ):
        """Analyze screenshot using GPT-4V"""
        try:
            # Encode the image
            base64_image = self.encode_image(image_path)

            # Create the message for GPT-4V
            response = self.client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}",
                                    "detail": "high",
                                },
                            },
                        ],
                    }
                ],
                max_tokens=max_tokens,
                temperature=0.1,
            )

            return response.choices[0].message.content

        except Exception as e:
            raise Exception(f"Error analyzing screenshot with GPT-4V: {str(e)}")

    def scrape_and_analyze(self, url, prompt, timeout=30000):
        """Complete workflow: take screenshot and analyze with GPT-4V"""
        try:
            # Take screenshot
            screenshot_path = self.take_screenshot(url, timeout)

            # Analyze with GPT-4V
            analysis = self.analyze_screenshot(screenshot_path, prompt)

            return {
                "url": url,
                "screenshot_path": screenshot_path,
                "analysis": analysis,
                "success": True,
            }

        except Exception as e:
            return {"url": url, "error": str(e), "success": False}


def main():
    """Example usage of VisionScraper"""
    try:
        scraper = VisionScraper()

        # Example usage
        url = input("Enter URL to scrape: ").strip()
        if not url:
            url = "https://example.com"

        prompt = input("Enter analysis prompt (default: describe the page): ").strip()
        if not prompt:
            prompt = "Describe what you see on this webpage. Include any important text, buttons, links, and overall layout."

        print(f"Scraping and analyzing: {url}")
        result = scraper.scrape_and_analyze(url, prompt)

        if result["success"]:
            print("\n" + "=" * 50)
            print("ANALYSIS RESULT:")
            print("=" * 50)
            print(result["analysis"])
            print("\n" + "=" * 50)
        else:
            print(f"Error: {result['error']}")

    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
    except Exception as e:
        print(f"Error: {str(e)}")


if __name__ == "__main__":
    main()
