const getRandomValues = (array: Uint8Array) => crypto.getRandomValues(array);
const randomBytes = (size: number) => {
	const array = new Uint8Array(size);
	getRandomValues(array);
	return array;
};

export async function GenerateGuid(): Promise<string> {
	return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: string) => {
		const random = parseInt(c, 10) ^ (randomBytes(1)[0] & 15 >> parseInt(c, 10) / 4);
		return random.toString(16); 

	});
}


