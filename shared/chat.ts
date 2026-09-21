export interface ChatMessage {
  id: string;
  at: number;
  name: string;
  text: string;
}
const vibes = [
  'Heady',
  'Spun',
  'Kind',
  'Cosmic',
  'Crunchy',
  'Fuzzy',
  'Lossy',
  'Quantized',
  'Overfit',
  'Zero-Shot',
  'Fine-Tuned',
  'Stochastic',
  'Sparse',
  'Greedy',
];
const handles = [
  'Box of RAG',
  'Dark Star Schema',
  'Ripple Regression',
  'Shakedown Tensor',
  'Touch of Gradient',
  'Tweezer Reprompt',
  'Scarlet Embeddings',
  'Casey Tokens',
  'Sugar Magnolia 7B',
  'China Cat Softmax',
  'Wharf RAG',
  'Bertha Large',
  'Divided Skynet',
  'Bathtub GAN',
  'Possum Kernel',
  'Wook2Vec',
  'Lot Llama',
  'Miracle Token',
  'Stealie Diffusion',
  'Goose Descent',
  'Disco Encoder',
  'Cheese Inference',
  'Terrapin Station ID',
  'Estimated Prompt',
  'Help on the Weights',
  'Uncle GPU',
  'Truckin Tokens',
  'Fire on the Mainframe',
  'Eyes of the World Model',
  'Mixture of Wooks',
  'Backprop Drifter',
  'Epoch Rider',
  'Noodle Transformer',
  'Type II Error',
];
/** A lot name for a stranger: "Spun Box of RAG", "Lossy Wharf RAG". */
export function funkyName(random = Math.random) {
  const pick = (list: string[]) => list[Math.floor(random() * list.length)];
  for (;;) {
    const name = `${pick(vibes)} ${pick(handles)}`;
    if (name.length <= 32) return name;
  }
}
