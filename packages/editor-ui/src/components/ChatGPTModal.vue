<template>
	<Modal
		width="540px"
		title="🔮 Ask JanGPT"
		:eventBus="modalBus"
		:name="CHAT_GPT_MODAL_KEY"
		:center="true"
	>
		<h1>JanGPT</h1>
	</Modal>
</template>

<script lang="ts">
import { CHAT_GPT_MODAL_KEY } from '@/constants';
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
		};
	},
	methods: {
		closeDialog() {
			this.modalBus.$emit('close');
		},
	},
});
</script>
