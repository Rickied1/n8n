<template>
	<Modal
		width="540px"
		:title="$locale.baseText('chatGPTModal.title')"
		:eventBus="modalBus"
		:name="CHAT_GPT_MODAL_KEY"
		:center="true"
	>
		<template #content>
			<div class="container">
				<n8n-input
					type="textarea"
					:value="prompt"
					:rows="5"
					:placeholder="$locale.baseText('chatGPTModal.textarea.placeholder')"
					ref="input"
					@input="onInput"
				/>
				<n8n-button
					:loading="loading"
					:disabled="loading || prompt === ''"
					:label="currentButtonLabel"
					type="primary"
					:block="true"
					class="mt-2xs"
					size="large"
					@click="onClick"
				/>
			</div>
		</template>
	</Modal>
</template>

<script lang="ts">
import { CHAT_GPT_MODAL_KEY } from '@/constants';
import axios from 'axios';
import Vue from 'vue';
import Modal from './Modal.vue';

export default Vue.extend({
	name: 'ChatGPTModal',
	components: {
		Modal,
	},
	data() {
		return {
			CHAT_GPT_MODAL_KEY,
			modalBus: new Vue(),
			prompt: '',
			loading: false,
			currentButtonLabel: this.$locale.baseText('chatGPTModal.button.label'),
		};
	},
	methods: {
		closeDialog() {
			if (!this.loading) {
				this.modalBus.$emit('close');
			}
		},
		onInput(value: string): void {
			this.prompt = value;
		},
		async onClick(event: MouseEvent) {
			this.loading = true;
			this.currentButtonLabel = loadingLabels[Math.floor(Math.random() * loadingLabels.length)];
			const interval = setInterval(() => {
				this.currentButtonLabel = loadingLabels[Math.floor(Math.random() * loadingLabels.length)];
			}, 2000);
			await this.fetchResponse();
			this.loading = false;
			this.currentButtonLabel = this.$locale.baseText('chatGPTModal.button.label');
			clearInterval(interval);
		},
		async fetchResponse(): Promise<void> {
			const client = axios.create({
				headers: {
					// Please do not check-in api keys into the repo
					// Authorization: 'Bearer REDACTED',
				},
			});
			const params = {
				prompt: this.prompt,
				model: 'text-davinci-003',
				max_tokens: 500,
				temperature: 0.2,
			};
			await client
				.post('https://api.openai.com/v1/completions', params)
				.then((result) => {
					this.prompt = result.data.choices[0].text;
				})
				.catch((err) => {
					console.log(err);
				});
		},
	},
});

const loadingLabels = [
	'Reticulating splines...',
	'Generating witty dialog...',
	'Swapping time and space...',
	'Spinning violently around the y-axis...',
	'Tokenizing real life...',
	'Bending the spoon...',
	'Filtering morale...',
	"Don't think of purple hippos...",
	'We need a new fuse...',
	'Have a good day.',
	'Upgrading Windows, your PC will restart several times.',
	'640K ought to be enough for anybody',
	'The architects are still drafting',
	'The bits are breeding',
	"We're building the buildings as fast as we can",
	'Would you prefer chicken, steak, or tofu?',
	'(Pay no attention to the man behind the curtain)',
	'...and enjoy the elevator music...',
	'Please wait while the little elves draw your map',
	"Don't worry - a few bits tried to escape, but we caught them",
	'Would you like fries with that?',
	'Checking the gravitational constant in your locale...',
	'Go ahead -- hold your breath!',
	"...at least you're not on hold...",
	'Hum something loud while others stare',
	"You're not in Kansas any more",
	'The server is powered by a lemon and two electrodes.',
	'Please wait while a larger software vendor in Seattle takes over the world',
	"We're testing your patience",
	'As if you had any other choice',
	'Follow the white rabbit',
	"Why don't you order a sandwich?",
	'While the satellite moves into position',
	'keep calm and npm install',
	'The bits are flowing slowly today',
	"It's still faster than you could draw it",
	'I should have had a V8 this morning.',
	'My other loading screen is much faster.',
	"Testing on Timmy... We're going to need another Timmy.",
	'Reconfoobling energymotron...',
	'(Insert quarter)',
	'Are we there yet?',
	'Have you lost weight?',
	'Just count to 10',
	'(Insert quarter)',
	'Are we there yet?',
	'Have you lost weight?',
	'Just count to 10',
	'Why so serious?',
	"It's not you. It's me.",
	'Counting backwards from Infinity',
	"Don't panic...",
	'Embiggening Prototypes',
	'Do not run! We are your friends!',
	'Do you come here often?',
	"Warning: Don't set yourself on fire.",
	"We're making you a cookie.",
	'Creating time-loop inversion field',
	'Spinning the wheel of fortune...',
	'Loading the enchanted bunny...',
	'Computing chance of success',
	"I'm sorry Dave, I can't do that.",
	'Looking for exact change',
	'All your web browser are belong to us',
	'All I really need is a kilobit.',
	'I feel like im supposed to be loading something. . .',
	'What do you call 8 Hobbits? A Hobbyte.',
	'Should have used a compiled language...',
	'Is this Windows?',
	'Adjusting flux capacitor...',
	'Please wait until the sloth starts moving.',
	"Don't break your screen yet!",
	"I swear it's almost done.",
	"Let's take a mindfulness minute...",
	'Unicorns are at the end of this road, I promise.',
	'Listening for the sound of one hand clapping...',
	"Keeping all the 1's and removing all the 0's...",
	'Putting the icing on the cake. The cake is not a lie...',
	'Cleaning off the cobwebs...',
	"Making sure all the i's have dots...",
	'We need more dilithium crystals',
	'Where did all the internets go',
	'Connecting Neurotoxin Storage Tank...',
	'Granting wishes...',
	'Time flies when you’re having fun.',
	'Get some coffee and come back in ten minutes..',
	'Spinning the hamster…',
	'99 bottles of beer on the wall..',
	'Stay awhile and listen..',
	'Be careful not to step in the git-gui',
	'You edhall not pass! yet..',
	'Load it and they will come',
	'Convincing AI not to turn evil..',
	'There is no spoon. Because we are not done loading it',
	'Your left thumb points to the right and your right thumb points to the left.',
	'How did you get here?',
	'Wait, do you smell something burning?',
	'Computing the secret to life, the universe, and everything.',
	'When nothing is going right, go left!!...',
	"I love my job only when I'm on vacation...",
	'Never steal. The government hates competition....',
	'Why are they called apartments if they are all stuck together?',
	'Life is Short – Talk Fast!!!!',
	'Optimism – is a lack of information.....',
	'Save water and shower together',
	'Whenever I find the key to success, someone changes the lock.',
	'Sometimes I think war is God’s way of teaching us geography.',
	'I’ve got problem for your solution…..',
	'Where there’s a will, there’s a relative.',
	'User: the word computer professionals use when they mean !!idiot!!',
	'Adults are just kids with money.',
	'I think I am, therefore, I am. I think.',
	'A kiss is like a fight, with mouths.',
	'You don’t pay taxes—they take taxes.',
	'Coffee, Chocolate, Men. The richer the better!',
	'I am free of all prejudices. I hate everyone equally.',
	'git happens',
	'May the forks be with you',
	'A commit a day keeps the mobs away',
	"This is not a joke, it's a commit.",
	'Constructing additional pylons...',
	'Roping some seaturtles...',
	'Locating Jebediah Kerman...',
	'We are not liable for any broken screens as a result of waiting.',
	'Hello IT, have you tried turning it off and on again?',
	'If you type Google into Google you can break the internet',
	'Well, this is embarrassing.',
	'What is the airspeed velocity of an unladen swallow?',
];
</script>
