const getRandomValues = (array: Uint8Array) => crypto.getRandomValues(array);
const randomBytes = (size: number) => {
	const array = new Uint8Array(size);
	getRandomValues(array);
	return array;
};

export async function GenerateGuid(): Promise<string> {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}


